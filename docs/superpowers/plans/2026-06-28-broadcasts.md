# Telegram Broadcasts (§11) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Admin composes a message and sends it to a **filtered worker segment** (city, gender, transportation, schedule, etc.) over Telegram — to all linked workers in the segment. Roadmap §11.

**Tech Stack:** Next.js 15, Google Sheets, Telegram.

## Global Constraints
- web extensionless imports. Reuse `filterWorkers` + `WorkerFilters` (web/lib/filter-workers.ts) and the `MultiSelectDropdown`. Telegram via the existing helpers. Only workers with a linked `telegram_chat_id` receive. Admin-guarded; identity/segment resolved server-side. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: generic Telegram send + broadcast route
**Files:** `packages/web/lib/telegram.ts` (add `sendToChatIds`); create `packages/web/app/api/admin/broadcast/route.ts`.

- [ ] **Step 1:** In `lib/telegram.ts`, add `export async function sendToChatIds(chatIds: string[], text: string): Promise<number>` — best-effort send to each id (reuse `buildSendUrl` + `TELEGRAM_BOT_TOKEN`); returns the count of attempted sends (or successful). Refactor `notifyAdmins(text, chatIds)` to call `sendToChatIds(chatIds, text)` (keep its signature/behavior). READ the current file first.
- [ ] **Step 2:** `packages/web/app/api/admin/broadcast/route.ts` — `POST`, `requireAdmin` (401). Body `{ message: string, filters: WorkerFilters }`. Validate `message` non-empty (400 if blank). `const workers = await listWorkers(getGateway())`; apply `filterWorkers(workers, filters)` (import from `../../../../lib/filter-workers`); `const recipients = filtered.filter(w => (w.telegramChatId ?? '').trim()).map(w => w.telegramChatId!.trim());` `const sent = await sendToChatIds(recipients, message);` Return `{ ok:true, matched: filtered.length, sent }`. `runtime='nodejs'`. Import depth `../../../../lib`.
- [ ] **Step 3:** Verify typecheck + build.
- [ ] **Step 4:** Commit `feat(web): broadcast route (Telegram to a filtered worker segment)`.

---

### Task 2: `/admin/broadcast` page + nav
**Files:** Create `packages/web/app/admin/broadcast/page.tsx` + `broadcast-client.tsx`; add a reachable link.

- [ ] **Step 1: Page** `/admin/broadcast/page.tsx` — server, `requireAdmin`→redirect. Load `listWorkers(getRequestGateway())` + `loadActivePlaces` + `loadCities`. Pass the workers (only fields needed: name, phone, city, gender, transportation, hebrewLevel, payType, schedule, places, active, telegramChatId) + the filter option lists (cities, places, GENDER/TRANSPORTATION/HEBREW_LEVEL/PAY_TYPE/SCHEDULE) to `<BroadcastClient>`. `runtime='nodejs'`,`dynamic='force-dynamic'`. Import depth `../../../lib`.
- [ ] **Step 2: `broadcast-client.tsx`** (`'use client'`) — a message `<textarea>`; the same segment filters as the workers list (reuse `MultiSelectDropdown` for city/gender/transportation/hebrewLevel/payType/schedule/places + an active select); a **live recipient preview**: apply `filterWorkers(workers, filters)` in the client, show "`N` workers match · `M` have Telegram linked" (M = those with `telegramChatId`); a **Send** button (disabled when message blank or M===0) that POSTs `{ message, filters }` to `/api/admin/broadcast`; on success show "Sent to `sent`/`M`" and clear the message. (Note under the preview: only linked workers receive; others must connect Telegram from their Profile.)
- [ ] **Step 3: Reachable** — add a **📣 Broadcast** link (a 7th admin-nav tab, OR a link on the Workers page header). Implementer's call but it MUST be reachable.
- [ ] **Step 4:** Verify typecheck + build (`/admin/broadcast` present).
- [ ] **Step 5:** Commit `feat(web): /admin/broadcast segmented Telegram messaging`.

---

## Self-Review Notes
- **Coverage:** segment broadcast (§11) — global = no filters; per-segment = filters; admins-only = filter active+admin (the filter already supports it). §10 contact remains the tappable phone in alerts.
- **Security:** segment resolved server-side via `filterWorkers`; only linked chat ids messaged; requireAdmin.
- **Reuse:** `filterWorkers`/`MultiSelectDropdown` from the workers list; `sendToChatIds` generalizes `notifyAdmins`.
- **Note:** WhatsApp-style pre-approved templates aren't needed for Telegram (free-form bot messages to users who've started the bot).
