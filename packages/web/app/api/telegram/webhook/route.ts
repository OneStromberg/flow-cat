import { getGateway } from '../../../../lib/sheets';
import { getSigningKey } from '../../../../lib/session';
import { verifyLinkToken } from '../../../../lib/telegram-link';
import { sendTelegram, answerCallbackQuery } from '../../../../lib/telegram';
import { notifyRecipients } from '../../../../lib/push';
import { tf } from '../../../../lib/i18n/strings';
import { linkTelegramChat, findWorker, findWorkerByChatId, listTemplates, listPlaces, listWorkers, toE164 } from '@scourage/worklog-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const update = await req.json();

    if (update?.callback_query) {
      const cq = update.callback_query;
      const data = String(cq.data ?? '');
      const fromId = String(cq.from?.id ?? '');
      try {
        const gw = getGateway();
        const worker = await findWorkerByChatId(gw, fromId);
        if (data.startsWith('accept:')) {
          const templateId = data.slice('accept:'.length);
          const tpl = (await listTemplates(gw)).find((t) => t.id === templateId);
          const origin = new URL(req.url).origin;
          const cardUrl = `${origin}/admin/workers/${encodeURIComponent(worker?.phone ?? '')}`;
          const label = tpl?.label ? ` — ${tpl.label}` : '';
          const admins = (await listWorkers(gw)).filter((w) => w.admin);
          await notifyRecipients(
            gw,
            admins,
            (lang) => tf('alert.shiftAccepted', lang, {
              location: tpl?.location ?? 'a shift',
              label,
              name: worker?.name ?? 'Someone',
              phone: toE164(worker?.phone ?? ''),
              cardUrl,
            }),
            { url: cardUrl },
          );
          await answerCallbackQuery(cq.id, 'Спасибо! Менеджер свяжется с вами.');
        } else if (data.startsWith('contact:')) {
          const templateId = data.slice('contact:'.length);
          const tpl = (await listTemplates(gw)).find((t) => t.id === templateId);
          const place = tpl ? (await listPlaces(gw)).find((p) => p.name === tpl.location) : undefined;
          await answerCallbackQuery(cq.id, place?.contact ? `Контакт: ${place.contact}` : 'Контакт не указан', true);
        } else {
          await answerCallbackQuery(cq.id, '');
        }
      } catch (e) {
        console.error('telegram callback handling failed:', e);
        try { await answerCallbackQuery(cq.id, ''); } catch {}
      }
      return Response.json({ ok: true });
    }

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
