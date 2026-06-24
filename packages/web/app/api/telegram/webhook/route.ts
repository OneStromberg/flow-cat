import { getGateway } from '../../../../lib/sheets';
import { getSigningKey } from '../../../../lib/session';
import { verifyLinkToken } from '../../../../lib/telegram-link';
import { sendTelegram } from '../../../../lib/telegram';
import { linkTelegramChat, findWorker } from '@scourage/worklog-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const update = await req.json();
    const msg = update?.message;
    const text: string = msg?.text ?? '';
    const chatId = String(msg?.chat?.id ?? '');
    const m = text.match(/^\/start\s+(\S+)/);
    if (m && chatId) {
      const phone = verifyLinkToken(m[1], getSigningKey());
      if (phone) {
        const gw = getGateway();
        const ok = await linkTelegramChat(gw, phone, chatId);
        const worker = ok ? await findWorker(gw, phone) : null;
        await sendTelegram(chatId, ok ? `✅ Connected${worker?.name ? ', ' + worker.name : ''}! You'll receive FlowCat alerts here.` : 'Could not connect — ask your manager.');
      } else {
        await sendTelegram(chatId, 'Invalid or expired link. Tap "Connect Telegram" in the app again.');
      }
    }
  } catch (err) {
    console.error('telegram webhook error:', err);
  }
  return Response.json({ ok: true }); // always 200 so Telegram doesn't retry
}
