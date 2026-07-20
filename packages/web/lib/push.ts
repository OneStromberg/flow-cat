import webpush from 'web-push';
import type { SheetsGateway } from '@scourage/sheets-helper';
import {
  listPushSubscriptions,
  hasPushSubscription,
  deactivatePushSubscription,
  type PushSub,
  type Worker,
} from '@scourage/worklog-core';
import { sendTelegram } from './telegram';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

interface VapidDetails {
  subject: string;
  publicKey: string;
  privateKey: string;
}

function vapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
}
function vapidPrivateKey(): string {
  return process.env.VAPID_PRIVATE_KEY ?? '';
}
function vapidSubject(): string {
  return process.env.VAPID_SUBJECT ?? '';
}

/** All three VAPID env vars must be present. */
export function isPushConfigured(): boolean {
  return Boolean(vapidPublicKey() && vapidPrivateKey() && vapidSubject());
}

let configuredSignature: string | null = null;
let warnedUnconfigured = false;

/**
 * Lazily calls webpush.setVapidDetails once per distinct config; no-ops if
 * unconfigured. A malformed key (bad deploy) makes setVapidDetails throw —
 * caught here and logged once so the sender no-ops instead of throwing,
 * which would otherwise break the missed-checkin cron before it reaches
 * recordAlerts.
 */
function ensureVapidConfigured(): VapidDetails | null {
  if (!isPushConfigured()) {
    // Surface a misconfigured deploy once: without this, every push send
    // silently returns 0 and the missed-checkin "once" claim is consumed
    // forever, so alerts vanish with no trace.
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        'web-push: VAPID env not configured — push sends are a silent no-op. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.',
      );
    }
    return null;
  }
  const details: VapidDetails = {
    subject: vapidSubject(),
    publicKey: vapidPublicKey(),
    privateKey: vapidPrivateKey(),
  };
  const signature = `${details.subject}|${details.publicKey}|${details.privateKey}`;
  if (configuredSignature !== signature) {
    try {
      webpush.setVapidDetails(details.subject, details.publicKey, details.privateKey);
      configuredSignature = signature;
    } catch (err) {
      console.error('ensureVapidConfigured: malformed VAPID config, push disabled', err);
      return null;
    }
  }
  return details;
}

/** Per-recipient cutover rule: push if subscribed, else Telegram for subscribed admins, else nothing. Pure. */
export function chooseChannel(opts: {
  hasPush: boolean;
  isAdmin: boolean;
  hasTelegramChat: boolean;
}): 'push' | 'telegram' | 'none' {
  if (opts.hasPush) return 'push';
  if (opts.isAdmin && opts.hasTelegramChat) return 'telegram';
  return 'none';
}

/**
 * Sends payload to every active push subscription for a phone. Best-effort: a per-endpoint
 * failure never aborts the others and this function never throws. Prunes subscriptions that
 * come back 404/410 (gone). No-ops (returns 0) if VAPID env is not configured.
 * Returns the count of successful sends.
 */
export async function sendPushToPhone(
  gw: SheetsGateway,
  phone: string,
  payload: PushPayload,
  deps?: {
    send?: (
      sub: PushSub,
      data: string,
      opts: { vapidDetails: VapidDetails },
    ) => Promise<{ statusCode?: number }>;
  },
): Promise<number> {
  const vapidDetails = ensureVapidConfigured();
  if (!vapidDetails) return 0;

  const send = deps?.send ?? ((sub, data, opts) => webpush.sendNotification(sub, data, opts));
  const data = JSON.stringify(payload);

  let subs: PushSub[];
  try {
    subs = await listPushSubscriptions(gw, phone);
  } catch (err) {
    console.error('sendPushToPhone: listPushSubscriptions failed for', phone, err);
    return 0;
  }

  let sentCount = 0;
  for (const sub of subs) {
    try {
      const result = await send(sub, data, { vapidDetails });
      if (result?.statusCode === 404 || result?.statusCode === 410) {
        await deactivatePushSubscription(gw, sub.endpoint, phone);
      } else {
        sentCount++;
      }
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        try {
          await deactivatePushSubscription(gw, sub.endpoint, phone);
        } catch (deactivateErr) {
          console.error('sendPushToPhone: deactivatePushSubscription failed for', sub.endpoint, deactivateErr);
        }
      } else {
        console.error('sendPushToPhone: send failed for', sub.endpoint, err);
      }
    }
  }
  return sentCount;
}

/**
 * Notifies a worker on their best available channel (push-over-Telegram cutover). Never throws.
 *
 * Delivery fallback: if the chosen channel is 'push' but every subscribed device
 * fails to deliver (sent === 0), and the worker is an admin with a linked Telegram
 * chat, fall back to Telegram so a subscribed admin whose devices all failed still
 * gets the alert — this is a safety/attendance path, not just a UX nicety.
 */
export async function notifyPhone(
  gw: SheetsGateway,
  worker: Worker,
  message: string,
  opts?: { url?: string; title?: string },
  deps?: Parameters<typeof sendPushToPhone>[3],
): Promise<'push' | 'telegram' | 'none'> {
  try {
    const hasPush = await hasPushSubscription(gw, worker.phone);
    const channel = chooseChannel({
      hasPush,
      isAdmin: !!worker.admin,
      hasTelegramChat: !!(worker.telegramChatId ?? '').trim(),
    });

    if (channel === 'push') {
      const sent = await sendPushToPhone(
        gw,
        worker.phone,
        {
          title: opts?.title ?? 'FlowCat',
          body: message,
          url: opts?.url,
        },
        deps,
      );
      const telegramChatId = (worker.telegramChatId ?? '').trim();
      if (sent === 0 && worker.admin && telegramChatId) {
        await sendTelegram(telegramChatId, message);
        return 'telegram';
      }
      return 'push';
    } else if (channel === 'telegram') {
      await sendTelegram((worker.telegramChatId ?? '').trim(), message);
    }
    return channel;
  } catch (err) {
    console.error('notifyPhone failed for', worker.phone, err);
    return 'none';
  }
}
