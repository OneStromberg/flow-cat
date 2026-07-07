# PM Batch 5 — Phase C3 (broadcast a template + Telegram Accept/Call buttons) — Design

**Date:** 2026-07-06
**Goal:** Broadcast a shift TEMPLATE (its full weekly schedule) to a worker segment with interactive Telegram buttons. Feature #4 (the broadcast redesign). Fixes the "multi-day template shows only one day" bug too.

## Decisions
- **Accept = notify admin only** (no auto-assign): tapping Accept sends the accepter's name + a link to their worker-card to the admin Telegram channel; the admin then assigns. (Per PM wording + confirmed.)
- Message shape (from the PM): "Доступна новая смена" / Location / Label / From (valid_from) / weekly schedule (per-day start–end) / [✅ Принять предложение] / [📞 Связаться].

## Telegram mechanics
- Send each recipient a `sendMessage` with `reply_markup.inline_keyboard`:
  - `[{ text: '✅ Принять предложение', callback_data: 'accept:<templateId>' }]`
  - `[{ text: '📞 Связаться', callback_data: 'contact:<templateId>' }]`
  (`callback_data` ≤ 64 bytes — `accept:tpl_xxx` fits.)
- **Note — Telegram inline buttons can't be `tel:` links.** So "Call" is a **callback** button: tapping it answers with the site's contact number in a popup (`answerCallbackQuery` `show_alert`), and the number is ALSO printed tappable in the message body (Telegram auto-links phone numbers). This is the reliable way to give a "call the contact" affordance.
- **Callback handling** in `/api/telegram/webhook` (currently only handles `/start` linking): also handle `update.callback_query`:
  - Identify the tapping worker by `callback_query.from.id` (== their `telegram_chat_id` in a private chat) → look up worker.
  - `accept:<templateId>` → load the template + place; `notifyAdmins('✅ <name> accepted <location> — <label>. 📞 <phone> · <worker-card URL>')`; `answerCallbackQuery('Спасибо! Менеджер свяжется с вами.')`.
  - `contact:<templateId>` → load template → place → contact phone; `answerCallbackQuery(show_alert:true, 'Контакт: <contact>')`.
  - Worker-card URL = `${requestOrigin}/admin/workers/${encodeURIComponent(phone)}` (admin-guarded; the admin is logged in when they tap it).
  - Keep the existing `/start` linking path intact; the secret-token guard still applies.

## Pieces
- **worklog-core:** `formatTemplateOffer(template, opts?: { contact?: string }): string` — pure message builder (title, location, label, valid-from, weekly schedule from `dayTimes` grouped by day incl. multi-slot). + `findWorkerByChatId(gateway, chatId)` (or reuse listWorkers filter). Tested.
- **web `lib/telegram.ts`:** `sendWithMarkup(chatId, text, replyMarkup)`, `sendOfferToChatIds(chatIds, text, replyMarkup): Promise<number>`, `answerCallbackQuery(callbackQueryId, text, showAlert?)`.
- **web webhook:** callback_query branch (accept/contact).
- **web broadcast:** a "broadcast a template" mode — pick a template, preview the formatted offer, send to the selected segment (reuse the existing segment filter + recipient resolution) with the inline keyboard.

## Out of scope
Auto-assign on accept (explicitly not wanted). Geoloc (C4).

## Testing
worklog-core (`formatTemplateOffer` incl. multi-slot days; `findWorkerByChatId`): Node test runner, TDD. web (telegram senders, webhook callback branch, broadcast mode): typecheck + build.
