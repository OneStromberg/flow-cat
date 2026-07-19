import type { SheetsGateway } from '@scourage/sheets-helper';
import type { Worker } from '@scourage/worklog-core';
import { deriveSigningKey } from '../signing-key';
import { makeLinkToken } from '../telegram-link';

// NOT derived via `lib/session.ts` on purpose — that module is marked
// `server-only`, which throws when loaded outside Next's server-component
// bundler (e.g. this file's own `node --test` unit test). Same signing-key
// derivation, computed locally so `loadProfileData` stays plain-Node testable.
// (Read inline per-call, not hoisted to a module constant, so tests can vary it.)

export interface ProfileData {
  name: string;
  phone: string;
  telegramLinked: boolean;
  /** Deep link to start the Telegram bot conversation; null when already linked or the bot isn't configured. */
  telegramConnectUrl: string | null;
}

/**
 * Loads everything the Profile screen needs, pre-resolved to plain JSON so the
 * client only has to render — no signing-key / Telegram link computation happens client-side.
 */
export async function loadProfileData(gw: SheetsGateway, worker: Worker): Promise<ProfileData> {
  void gw; // unused — the Profile screen renders only fields already present on `worker`
  const telegramLinked = !!worker.telegramChatId;
  const botUser = process.env.TELEGRAM_BOT_USERNAME ?? '';

  let telegramConnectUrl: string | null = null;
  if (!telegramLinked && botUser) {
    const key = deriveSigningKey(process.env.SESSION_SECRET, process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const token = makeLinkToken(worker.phone, key);
    telegramConnectUrl = `https://t.me/${botUser}?start=${token}`;
  }

  return {
    name: worker.name,
    phone: worker.phone,
    telegramLinked,
    telegramConnectUrl,
  };
}
