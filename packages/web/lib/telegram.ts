export function adminChatIds(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}
export function buildSendUrl(token: string): string {
  return `https://api.telegram.org/bot${token}/sendMessage`;
}
/** Best-effort: never throws; no-op (warn) if env missing. */
export async function notifyAdmins(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const ids = adminChatIds(process.env.TELEGRAM_ADMIN_CHAT_IDS);
  if (!token || ids.length === 0) { console.warn('notifyAdmins: TELEGRAM env not set; skipping'); return; }
  const url = buildSendUrl(token);
  for (const chat_id of ids) {
    try {
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text }) });
    } catch (err) {
      console.error('notifyAdmins: telegram send failed for', chat_id, err);
    }
  }
}
