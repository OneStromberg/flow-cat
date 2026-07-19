import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import { normalizePhone } from './phone.ts';

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const PUSH_COLUMNS = ['phone', 'endpoint', 'p256dh', 'auth', 'created_at', 'user_agent', 'active'];

async function ensurePushHeader(gateway: SheetsGateway): Promise<string[]> {
  const rows = await gateway.readTab('PushSubscriptions');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];
  const header = [...existing];
  for (const c of PUSH_COLUMNS) if (!header.includes(c)) header.push(c);
  if (existing.length === 0 || header.length !== existing.length) {
    await gateway.writeHeaderRow('PushSubscriptions', header);
  }
  return header;
}

function toPushSub(o: Record<string, string>): PushSub {
  return {
    endpoint: (o.endpoint ?? '').trim(),
    keys: {
      p256dh: (o.p256dh ?? '').trim(),
      auth: (o.auth ?? '').trim(),
    },
  };
}

export async function savePushSubscription(
  gateway: SheetsGateway,
  phone: string,
  sub: PushSub,
  userAgent = '',
  now = new Date().toISOString(),
): Promise<void> {
  const header = await ensurePushHeader(gateway);
  const rows = await gateway.readTab('PushSubscriptions');
  const normalizedPhone = normalizePhone(phone);

  const idx = rows.findIndex(
    (r, i) => i > 0 && (r[header.indexOf('endpoint')] ?? '').trim() === sub.endpoint,
  );

  if (idx >= 0) {
    const existingPhone = normalizePhone((rows[idx][header.indexOf('phone')] ?? '').trim());
    if (existingPhone && existingPhone !== normalizedPhone) {
      // This endpoint currently belongs to a different worker (a device that
      // changed hands). Never overwrite the other worker's row in place —
      // deactivate it and append a fresh row for the caller instead.
      const staleRow = [...rows[idx]];
      staleRow[header.indexOf('active')] = 'no';
      await gateway.updateRow('PushSubscriptions', idx + 1, staleRow);

      const record: Record<string, string> = {
        phone: normalizedPhone,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        created_at: now,
        user_agent: userAgent,
        active: 'yes',
      };
      await gateway.appendRow('PushSubscriptions', objectToRow(record, header));
      return;
    }

    // Row exists and belongs to this worker (or has no phone on record):
    // re-activate and refresh phone/keys/user_agent in place.
    const newRow = [...rows[idx]];
    newRow[header.indexOf('phone')] = normalizedPhone;
    newRow[header.indexOf('p256dh')] = sub.keys.p256dh;
    newRow[header.indexOf('auth')] = sub.keys.auth;
    newRow[header.indexOf('user_agent')] = userAgent;
    newRow[header.indexOf('active')] = 'yes';
    await gateway.updateRow('PushSubscriptions', idx + 1, newRow);
  } else {
    const record: Record<string, string> = {
      phone: normalizedPhone,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      created_at: now,
      user_agent: userAgent,
      active: 'yes',
    };
    await gateway.appendRow('PushSubscriptions', objectToRow(record, header));
  }
}

export async function listPushSubscriptions(gateway: SheetsGateway, phone: string): Promise<PushSub[]> {
  const target = normalizePhone(phone);
  const objs = rowsToObjects(await gateway.readTab('PushSubscriptions'));
  return objs
    .filter((o) => normalizePhone((o.phone ?? '').trim()) === target)
    .filter((o) => (o.active ?? '').trim().toLowerCase() !== 'no')
    .map(toPushSub)
    .filter((s) => s.endpoint);
}

export async function listAllPushSubscriptions(
  gateway: SheetsGateway,
): Promise<{ phone: string; sub: PushSub }[]> {
  const objs = rowsToObjects(await gateway.readTab('PushSubscriptions'));
  return objs
    .filter((o) => (o.active ?? '').trim().toLowerCase() !== 'no')
    .filter((o) => (o.endpoint ?? '').trim())
    .map((o) => ({ phone: (o.phone ?? '').trim(), sub: toPushSub(o) }));
}

export async function hasPushSubscription(gateway: SheetsGateway, phone: string): Promise<boolean> {
  const subs = await listPushSubscriptions(gateway, phone);
  return subs.length > 0;
}

/**
 * Soft-deletes the subscription row for `endpoint`. When `phone` is provided,
 * this is an ownership check: the row is only deactivated if its stored
 * (normalized) phone matches — otherwise it's a no-op, so one worker can
 * never deactivate another worker's subscription (IDOR guard for
 * /api/push/unsubscribe).
 */
export async function deactivatePushSubscription(
  gateway: SheetsGateway,
  endpoint: string,
  phone?: string,
): Promise<void> {
  const header = await ensurePushHeader(gateway);
  const rows = await gateway.readTab('PushSubscriptions');

  const idx = rows.findIndex(
    (r, i) => i > 0 && (r[header.indexOf('endpoint')] ?? '').trim() === endpoint,
  );

  if (idx < 0) return;

  if (phone !== undefined) {
    const existingPhone = normalizePhone((rows[idx][header.indexOf('phone')] ?? '').trim());
    if (existingPhone !== normalizePhone(phone)) return;
  }

  const newRow = [...rows[idx]];
  newRow[header.indexOf('active')] = 'no';
  await gateway.updateRow('PushSubscriptions', idx + 1, newRow);
}
