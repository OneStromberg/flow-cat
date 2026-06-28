import type { Worker } from '@scourage/worklog-core';

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  if (!token) return;
  try {
    await fetch(buildSendUrl(token), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }) });
  } catch (err) { console.error('sendTelegram failed:', err); }
}

/** Best-effort send to multiple chat IDs; returns count of sends attempted. Never throws. */
export async function sendToChatIds(chatIds: string[], text: string): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  if (!token || chatIds.length === 0) return 0;
  const url = buildSendUrl(token);
  for (const chat_id of chatIds) {
    try {
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text }) });
    } catch (err) {
      console.error('sendToChatIds: telegram send failed for', chat_id, err);
    }
  }
  return chatIds.length;
}

/** Admin recipients = workers flagged admin who have linked their Telegram chat. */
export function pickAdminChatIds(workers: Worker[]): string[] {
  return workers
    .filter((w) => w.admin && (w.telegramChatId ?? '').trim() !== '')
    .map((w) => (w.telegramChatId ?? '').trim());
}
export function buildSendUrl(token: string): string {
  return `https://api.telegram.org/bot${token}/sendMessage`;
}
/** Best-effort: never throws; no-op (warn) if no bot token or no linked admin chats. */
export async function notifyAdmins(text: string, chatIds: string[]): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN || chatIds.length === 0) {
    console.warn('notifyAdmins: no bot token or no linked admin chats; skipping');
    return;
  }
  await sendToChatIds(chatIds, text);
}
