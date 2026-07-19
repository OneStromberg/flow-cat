# Web Push Notifications — Design

**Date:** 2026-07-19
**Status:** Approved (brainstorming) — pending plan
**Goal:** End-to-end Web Push for logged-in users (workers **and** admins): a primed opt-in, per-device subscription storage, a server sender, SW `push`/`notificationclick` handlers, a "send test" button, and the missed-check-in event wired. **Per recipient, once they have a live push subscription, alerts go to push only** (not Telegram); unsubscribed admins keep Telegram.

Implements discovery-doc item 3 (Web Push alongside Telegram). Items 1–2 (Notifier abstraction over all trigger sites + i18n templates, cold-start dedup fix) are an explicit follow-up.

## Locked decisions
| # | Decision | Choice |
|---|---|---|
| 1 | Audience | **Both** — workers and admins can subscribe. |
| 2 | Telegram vs push | **Per-recipient cutover** — a recipient WITH a live subscription gets push ONLY; without one, admins fall back to Telegram (workers get nothing, as today). |
| 3 | Opt-in | **Primed** — our own explainer modal first, then the system permission prompt; the decision is stored. |
| 4 | Scope | **Working push + test button + wire missed-check-in.** No Notifier refactor of the other ~6 trigger sites, no dedup-bug fix, no global Telegram hard-cut. |

## A. VAPID keys (config)
A P-256 VAPID keypair (generated during the build, handed to the user for Vercel):
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — client (applicationServerKey).
- `VAPID_PRIVATE_KEY` — server-only.
- `VAPID_SUBJECT` — `mailto:` contact.
Push is inert (server sender no-ops, client hides opt-in) until these are set — fail safe, log once.

## B. Subscription store (`worklog-core`)
`packages/worklog-core/src/data/push-subscriptions.ts` + a `PushSubscriptions` tab. Columns: `phone, endpoint, p256dh, auth, created_at, user_agent, active`. One row per device (a worker may have several). Append-only / **soft-delete** (`active='no'`) per the repo's no-row-deletion convention.
- `savePushSubscription(gw, phone, sub: PushSub, userAgent?)` — upsert by `endpoint` (update if the endpoint row exists, else append), `phone` normalized via `normalizePhone`, `active='yes'`.
- `listPushSubscriptions(gw, phone)` — this worker's active subs.
- `listAllPushSubscriptions(gw)` — all active subs.
- `hasPushSubscription(gw, phone)` — boolean.
- `deactivatePushSubscription(gw, endpoint)` — soft-delete on prune (404/410).
- `PushSub` type: `{ endpoint: string; keys: { p256dh: string; auth: string } }`.
Fully unit-tested with `createMemoryGateway`.

## C. Server sender + channel helper (`packages/web/lib/push.ts`)
Add the `web-push` dependency (server-side).
- `sendPushToPhone(gw, phone, payload: PushPayload): Promise<number>` — `listPushSubscriptions` → `webpush.sendNotification(sub, JSON.stringify(payload), { vapidDetails })` for each; on `404`/`410` → `deactivatePushSubscription(endpoint)`; best-effort, never throws; returns count sent. No-op if VAPID env unset.
- `notifyPhone(gw, worker, message, opts?: { url?; title? }): Promise<'push'|'telegram'|'none'>` — **channel selection:** if `hasPushSubscription(phone)` → `sendPushToPhone` and return `'push'` (NO Telegram); else if `worker.admin && telegramChatId` → `sendTelegram` and return `'telegram'`; else `'none'`.
- `PushPayload` type: `{ title: string; body: string; url?: string }`.
The channel-selection branch is unit-tested (memory gateway: subscribed → push path; unsubscribed admin → telegram path; unsubscribed worker → none).

## D. Endpoints (`packages/web/app/api/push/*`)
- `subscribe/route.ts` (POST) — `requireWorker` → parse `{ endpoint, keys }` → `savePushSubscription(gw, worker.phone, sub, req UA)` → `{ ok: true }`. 401 if no worker.
- `unsubscribe/route.ts` (POST) — `requireWorker` → `{ endpoint }` → `deactivatePushSubscription`. 
- `test/route.ts` (POST) — `requireWorker` → `sendPushToPhone(gw, worker.phone, { title: 'FlowCat', body: 'Test notification ✓' })` → `{ ok, sent }`.
All `runtime='nodejs'`, `dynamic='force-dynamic'`.

## E. Service-worker handlers (`packages/web/app/sw.ts`)
Add before/after the Serwist setup:
- `self.addEventListener('push', e => e.waitUntil(self.registration.showNotification(title, { body, icon: '/icon-192.png', badge, data: { url } })))` — parse `e.data?.json()`; fall back to a default title/body if payload is missing/unparseable.
- `self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(focus an existing client at the url, else clients.openWindow(url ?? '/')) })`.
Must not interfere with the existing precache/offline/runtime-caching setup.

## F. Primed opt-in UI (`packages/web/app/components/notifications-optin.tsx`)
Client component for logged-in users:
- Reads `Notification.permission` + `registration.pushManager.getSubscription()` + a localStorage decision key `flowcat-push-prompt` (`unseen | dismissed`).
- **default/unseen** → a small "🔔 Turn on alerts" affordance → tap opens **our explainer modal** ("Get notified about your shifts & missed check-ins — no more relying on Telegram.") with Enable / Not now. Enable → `Notification.requestPermission()` → if `granted` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <VAPID public> })` → POST `/api/push/subscribe`. "Not now" → store `dismissed`.
- **granted + subscribed** → "Alerts on ✓" + a **"Send test"** button (POST `/api/push/test`).
- **denied** → a short hint (how to re-enable in browser settings); no re-nag.
- **iOS + not standalone** → the modal explains push needs the installed app first (links to the install affordance); no subscribe attempt.
- Self-hides when push is unsupported or VAPID public key is absent. i18n `push.*` keys EN + RU (+ HE). Mounted in the worker `/app` layout **and** the admin layout.

## G. Wire missed-check-in (`packages/web/app/api/cron/missed-checkins/route.ts`)
For each due event, in addition to the existing admin grouping:
- **Admin:** send the per-location admin summary via `notifyPhone(gw, adminWorker, msg, { url: '/admin/attendance' })` for each admin recipient (push-or-Telegram), replacing the direct `notifyAdmins` Telegram call for the push-capable admins while keeping Telegram for the rest — implemented via `notifyPhone` per admin.
- **Worker:** for each missed worker, `sendPushToPhone(gw, m.employeePhone, { title, body: 'You missed check-in at <loc>', url: '/app/checkin' })` (push only; workers have no Telegram).
Preserve `recordAlerts(gw, due)` dedup and the 2h horizon exactly.

## Testing
- **Unit (`worklog-core`):** `push-subscriptions` store — upsert-by-endpoint, list-by-phone (excludes other workers + inactive), `has`, soft-delete.
- **Unit (`web`):** `notifyPhone` channel selection (subscribed→push, unsubscribed-admin→telegram, unsubscribed-worker→none) with a memory gateway + a stubbed sender; `sendPushToPhone` prune-on-410 (stubbed webpush).
- **Build/type:** `typecheck && build && test` green; `sw.js` still generated with the push handlers.
- **Manual (needs VAPID env on a deploy):** subscribe as admin → "Send test" → receive push → tapping opens the app; trigger a missed check-in → admin gets push (and no Telegram once subscribed); verify iOS shows the install-first message when not standalone.

## Non-goals (follow-up)
- Notifier abstraction over the other ~6 trigger sites + i18n message templates (doc items 1–2).
- Cold-start dedup-persistence bug fix.
- Global Telegram hard-cut / admin-linking removal.
- Rich notification actions (Accept/Decline buttons) — parity with Telegram inline keyboards comes later.

## Risks / notes
- **iOS:** Web Push only reaches an **installed** PWA (16.4+); the opt-in must detect non-standalone iOS and route to install first (we shipped install already).
- **VAPID env gating:** everything no-ops safely until the three env vars are set on Vercel; the build must not fail when they're absent (server sender guards; client hides opt-in).
- **Pruning:** a revoked/expired subscription returns 404/410 on send → soft-deleted, so stale endpoints don't accumulate or mis-route.
- **Payload size:** Web Push caps ~4KB; keep payloads to title/body/url.
- No change to the other trigger sites this slice — they stay Telegram-only until the Notifier follow-up.
