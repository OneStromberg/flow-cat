import type { Worker } from '@scourage/worklog-core';

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
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  if (!token || chatIds.length === 0) { console.warn('notifyAdmins: no bot token or no linked admin chats; skipping'); return; }
  const url = buildSendUrl(token);
  for (const chat_id of chatIds) {
    try {
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text }) });
    } catch (err) {
      console.error('notifyAdmins: telegram send failed for', chat_id, err);
    }
  }
}
