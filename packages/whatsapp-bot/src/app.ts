import { createGoogleGateway } from '@scourage/sheets-helper';
import type { Config } from './config.ts';
import { createConsoleClient } from './whatsapp/console-client.ts';
import { loadQuestions } from './questions/load-questions.ts';
import { createMemorySessionStore } from './conversation/session-store.ts';
import type { EngineDeps } from './conversation/engine.ts';
import type { WhatsAppClient } from './whatsapp/types.ts';

const SESSION_TTL_MS = 30 * 60_000;
const QUESTIONS_TTL_MS = 60_000;

export function createApp(config: Config, whatsappOverride?: WhatsAppClient): { deps: EngineDeps } {
  const gateway = createGoogleGateway({
    keyFilePath: config.keyFilePath,
    spreadsheetId: config.spreadsheetId,
  });
  const now = () => new Date();

  // TTL-cached questions provider
  let cache: { at: number; qs: Awaited<ReturnType<typeof loadQuestions>> } | null = null;
  const getQuestions = async () => {
    const t = now().getTime();
    if (cache && t - cache.at < QUESTIONS_TTL_MS) return cache.qs;
    const qs = await loadQuestions(gateway);
    cache = { at: t, qs };
    return qs;
  };

  let whatsapp = whatsappOverride;
  if (!whatsapp) {
    if (config.transport === 'console') {
      whatsapp = createConsoleClient();
    } else {
      throw new Error('cloud transport is wired in server.ts (Task 16), not here');
    }
  }

  const deps: EngineDeps = {
    gateway,
    whatsapp,
    sessions: createMemorySessionStore(SESSION_TTL_MS, now),
    getQuestions,
    tz: config.timezone,
    now,
  };
  return { deps };
}
