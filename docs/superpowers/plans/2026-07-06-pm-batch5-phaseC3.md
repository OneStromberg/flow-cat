# PM Batch 5 — Phase C3 (broadcast template + Telegram buttons) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Broadcast a template with weekly schedule + Accept/Contact Telegram buttons (spec: `docs/superpowers/specs/2026-07-06-pm-batch5-phaseC3-broadcast-buttons-design.md`). Accept = notify admin only.

## Global Constraints
- worklog-core ESM `.ts`; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; `pnpm --filter @scourage/web typecheck && build`.
- Telegram best-effort (never throw into a request). Commit author = OneStromberg; LOCAL commits. ponytail.

---

### Task 1: core — `formatTemplateOffer` + `findWorkerByChatId`
**Files:** `packages/worklog-core/src/data/shift-templates.ts` (formatter) + `workers.ts` (lookup); export from `src/index.ts`; tests.

- [ ] **Step 1: Failing tests:**
```ts
// formatTemplateOffer
test('formatTemplateOffer lists the full weekly schedule incl. multi-slot days', () => {
  const t = { id:'t1', location:'Big Gedera', label:'Guard', validFrom:'2026-07-10', headcount:1,
    dayTimes:[{day:'mon',start:'06:00',end:'14:00'},{day:'mon',start:'14:00',end:'22:00'},{day:'tue',start:'08:00',end:'16:00'}] } as any;
  const s = formatTemplateOffer(t, { contact:'972500000000' });
  assert.ok(s.includes('Big Gedera')); assert.ok(s.includes('Guard'));
  assert.ok(s.includes('06:00') && s.includes('14:00') && s.includes('22:00') && s.includes('08:00'));
  assert.ok(s.includes('972500000000'));
});
// findWorkerByChatId
test('findWorkerByChatId matches by telegram_chat_id', async () => {
  const g = createMemoryGateway({ Workers: [
    ['phone','name','greeting','places','active','token','teudat_zeut','admin','city','age','transportation','hebrew_level','pay_type','pay_amount','schedule','gender','pay_structure','pay_rate','telegram_chat_id'],
    ['972501112222','Dana','','', 'yes','tk','','', '', '', '','','','','','','','', '55501'],
  ]});
  const w = await findWorkerByChatId(g, '55501');
  assert.equal(w?.name, 'Dana');
  assert.equal(await findWorkerByChatId(g, 'nope'), null);
});
```
- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement:**
  - `formatTemplateOffer(template, opts)` in `shift-templates.ts`: build a string — a title line "🆕 Доступна новая смена", `Location: <location>`, `Label: <label>` (skip if empty), `From: <validFrom>` (skip if empty), then a "Schedule:" block grouping `dayTimes` by day (in week order mon..sun) listing `="<day>: <start>–<end>[, <start2>–<end2>]"`, and if `opts.contact` a `Contact: <contact>` line. Pure, no I/O. Export.
  - `findWorkerByChatId(gateway, chatId)` in `workers.ts`: `const objs = rowsToObjects(await gw.readTab('Workers')); const row = objs.find(o => (o.telegram_chat_id??'').trim() === String(chatId).trim() && (o.telegram_chat_id??'').trim() !== ''); return row ? parseWorker(row, []) : null;`. Export.
- [ ] **Step 4: Run — pass + typecheck.**
- [ ] **Step 5: Commit.** `git commit -m "feat(core): formatTemplateOffer + findWorkerByChatId (C3)"`

---

### Task 2: web telegram senders + answerCallbackQuery
**Files:** `packages/web/lib/telegram.ts`.
- [ ] **Step 1:** Add (reuse `buildSendUrl` + `TELEGRAM_BOT_TOKEN`; all best-effort try/catch, never throw):
```ts
export async function sendWithMarkup(chatId: string, text: string, replyMarkup: unknown): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? ''; if (!token) return;
  try { await fetch(buildSendUrl(token), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }) }); }
  catch (e) { console.error('sendWithMarkup failed:', e); }
}
export async function sendOfferToChatIds(chatIds: string[], text: string, replyMarkup: unknown): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? ''; if (!token || !chatIds.length) return 0;
  for (const id of chatIds) await sendWithMarkup(id, text, replyMarkup);
  return chatIds.length;
}
export async function answerCallbackQuery(callbackQueryId: string, text: string, showAlert = false): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? ''; if (!token) return;
  try { await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: showAlert }) }); }
  catch (e) { console.error('answerCallbackQuery failed:', e); }
}
```
- [ ] **Step 2:** `pnpm --filter @scourage/web typecheck && build` → pass.
- [ ] **Step 3: Commit.** `git commit -m "feat(web): telegram inline-keyboard + callback-answer helpers (C3)"`

---

### Task 3: webhook handles callback_query (accept / contact)
**Files:** `packages/web/app/api/telegram/webhook/route.ts`.
- [ ] **Step 1:** Read the current handler (it processes `update.message` `/start <token>` linking with a secret-token guard). Keep that path.
- [ ] **Step 2:** Add, after parsing `update`: if `update.callback_query` exists, handle it (still under the secret-token guard):
  - `const cq = update.callback_query; const data = String(cq.data ?? ''); const fromId = String(cq.from?.id ?? '');`
  - `const worker = await findWorkerByChatId(gw, fromId);`
  - If `data.startsWith('accept:')`: `const templateId = data.slice(7); const tpl = (await listTemplates(gw)).find(t => t.id === templateId);` then load place (`listPlaces` → by `tpl.location`) for context. `const origin = new URL(req.url).origin; const cardUrl = `${origin}/admin/workers/${encodeURIComponent(worker?.phone ?? '')}`;` `await notifyAdmins(`✅ ${worker?.name ?? 'Someone'} accepted ${tpl?.location ?? ''}${tpl?.label ? ' — '+tpl.label : ''}. 📞 ${worker?.phone ?? ''} · ${cardUrl}`, pickAdminChatIds(await listWorkers(gw)));` then `await answerCallbackQuery(cq.id, 'Спасибо! Менеджер свяжется с вами.');`
  - If `data.startsWith('contact:')`: `const templateId = data.slice(8); const tpl = ...; const place = (await listPlaces(gw)).find(p => p.name === tpl?.location); await answerCallbackQuery(cq.id, place?.contact ? `Контакт: ${place.contact}` : 'Контакт не указан', true);`
  - Always return `Response.json({ ok: true })` (Telegram expects 200; never 500 on callback handling — wrap in try/catch). Import `findWorkerByChatId, listTemplates, listPlaces, listWorkers` from core and `notifyAdmins, pickAdminChatIds, answerCallbackQuery` from the lib.
- [ ] **Step 3:** `pnpm --filter @scourage/web typecheck && build` → pass.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): telegram webhook handles Accept/Contact callbacks (C3)"`

---

### Task 4: broadcast a template (with buttons)
**Files:** `packages/web/app/admin/broadcast/page.tsx` + `broadcast-client.tsx`; a send path (extend the existing broadcast route or add `app/api/admin/broadcast/template/route.ts`).
- [ ] **Step 1:** Read the current broadcast page/client + its send route (batch-3/4: free-text + "compose from shift"). Note how the segment filter + recipient chat-id resolution work.
- [ ] **Step 2:** Page: also load templates (`listTemplates(gw)` active) and pass a slim list `{ id, location, label }[]` to the client.
- [ ] **Step 3:** Client: add a **"Broadcast a template"** mode — a `<select>` of templates; on pick, show a read-only PREVIEW of `formatTemplateOffer` output (compute client-side or fetch); a **Send offer** button that POSTs `{ templateId, filters }` to the template-broadcast route.
- [ ] **Step 4:** Route `POST` (admin-guarded): body `{ templateId, filters }`. Load the template, its place (for contact), resolve recipients = `filterWorkers(listWorkers, filters)` with a linked `telegramChatId` (reuse the existing segment logic). `const text = formatTemplateOffer(tpl, { contact: place?.contact });` `const markup = { inline_keyboard: [[{ text:'✅ Принять предложение', callback_data:`accept:${tpl.id}` }],[{ text:'📞 Связаться', callback_data:`contact:${tpl.id}` }]] };` `const sent = await sendOfferToChatIds(recipientChatIds, text, markup);` return `{ ok:true, sent }`.
- [ ] **Step 5:** `pnpm --filter @scourage/web typecheck && build` → pass.
- [ ] **Step 6: Commit.** `git commit -m "feat(web): broadcast a template with Accept/Contact buttons (C3)"`

---

## Self-Review Notes
- **Coverage:** feat4 → T1 (formatter+lookup) · T2 (senders) · T3 (callbacks) · T4 (broadcast mode). Accept = notify-only (T3).
- **Type consistency:** `formatTemplateOffer`/`findWorkerByChatId` (T1) consumed by T3/T4; `sendOfferToChatIds`/`answerCallbackQuery` (T2) consumed by T3/T4.
- **Ordering:** T1 → T2 → T3 → T4 (each builds on prior). All Telegram calls best-effort.
- **Telegram limits:** callback_data ≤64B (fits); no `tel:` inline buttons (Contact is a callback popup + tappable number in text).
