import { makeLinkToken } from '../../lib/telegram-link';
import { getSigningKey } from '../../lib/session';

export function TelegramConnect({ phone, linked }: { phone: string; linked: boolean }) {
  const botUser = process.env.TELEGRAM_BOT_USERNAME ?? '';
  if (linked) return <p className="text-sm text-green-700">Telegram connected ✓</p>;
  if (!botUser) return <p className="text-sm text-gray-400">Telegram not configured.</p>;
  const token = makeLinkToken(phone, getSigningKey());
  return (
    <a href={`https://t.me/${botUser}?start=${token}`} target="_blank" rel="noopener noreferrer"
       className="inline-block rounded-lg bg-sky-600 px-3 py-2 text-sm text-white">Connect Telegram</a>
  );
}
