# Migrate Remaining Alerts to Push + i18n'd Templates — Design

**Date:** 2026-07-20
**Status:** Approved (brainstorming) — pending plan
**Goal:** Route every remaining system alert through the per-recipient push-or-Telegram cutover (`notifyPhone`), and move all system-generated alert copy into the RU/EN/HE i18n dictionary as interpolated templates, built per recipient in their own language. Completes discovery-doc items 2–3 (Notifier seam + i18n templates); the earlier slices did the missed-checkin cron, the store, the sender, and the opt-in UI.

## Principle: per-recipient, localized delivery
Each recipient has their own `worker.lang`, so a single shared message string no longer works — messages are built **inside the fan-out loop, per recipient**. The current code builds one string and blasts it to all admin chat IDs; that becomes: for each recipient, build the message in their language, then `notifyPhone`.

## A. Interpolating i18n (`packages/web/lib/i18n/strings.ts`)
- Keep the existing static `t(key, lang)` untouched.
- Add `export function tf(key: StringKey, lang: Lang, params: Record<string, string | number>): string` — resolves `t(key, lang)` then replaces `{placeholder}` tokens with `params`. A missing param → empty string (never `undefined`/`{param}` leaks). No effect on keys without placeholders.

## B. Alert templates (`alert.*` keys, EN + RU + HE)
Move each **system-generated** alert's copy into the dictionary, preserving emoji + structure, replacing interpolated values with `{placeholders}`. The implementer reads each site's current exact string and templatizes it. The set:
- `alert.earlyCheckin`, `alert.earlyCheckout`, `alert.shortShift`, `alert.coverageGap` — from `app/api/checkin/route.ts`.
- `alert.offsite` — from `app/api/geo/ping/route.ts`.
- `alert.shiftGen`, `alert.shiftGenFailed` — from `app/api/cron/generate-shifts/route.ts`.
- `alert.backup*` — from `app/api/cron/backup/route.ts` (templatize whatever it currently sends).
- `alert.shiftAccepted` — the admin alert in `app/api/telegram/webhook/route.ts`.
- `alert.missedGroupHeader`, `alert.missedLine`, `alert.workerMissed` — from `app/api/cron/missed-checkins/route.ts` (re-touched for consistency).
- `alert.missedDetectorFailed` — the cron failure notice.
EN is authoritative (defines `StringKey`); **RU is an exhaustive `Record<StringKey,string>` so every key MUST be added to RU or typecheck fails**; HE is `Partial` (falls back to EN). Placeholder names are shared across languages.

## C. Fan-out helper (`packages/web/lib/push.ts`)
`export async function notifyRecipients(gw, recipients: Worker[], build: (lang: Lang) => string, opts?: { url?: string; title?: string }): Promise<void>` — for each recipient, `await notifyPhone(gw, r, build(resolveLang(r.lang)), opts)`. Bounded concurrency (`Promise.allSettled` over the set, or a small concurrency cap), never throws. `resolveLang`/`Lang` come from `lib/i18n/strings`.

## D. Site migration
Replace `notifyAdmins(msg, pickAdminChatIds(workers))` (and `sendToChatIds`) with `notifyRecipients(...)`:
| Site | Recipients | Build |
|---|---|---|
| `checkin/route.ts` × 4 (early-in, early-out, short-shift, coverage-gap) | `workers.filter(w => w.admin)` | `tf('alert.earlyCheckin', lang, {...})` etc.; `{url:'/admin/attendance'}` |
| `geo/ping/route.ts` (offsite) | admins | keep the existing `tryClaim(...)` gate; swap the send inside it to `notifyRecipients` with `tf('alert.offsite', ...)` |
| `cron/generate-shifts/route.ts` | admins | `tf('alert.shiftGen'/'alert.shiftGenFailed', ...)` |
| `cron/backup/route.ts` | admins | `tf('alert.backup*', ...)` |
| `telegram/webhook/route.ts` (shift-accepted) | admins | `tf('alert.shiftAccepted', ...)`; the bot's own `answerCallbackQuery` / `linkTelegramChat` / callback handling STAYS Telegram-native |
| `cron/missed-checkins/route.ts` | admins + missed worker | re-touch to build the admin lines + worker push via `tf(...)` per recipient (keep the atomic `tryClaim` dedup + grouping) |
| `broadcast/route.ts` | **filtered workers** | message is admin-authored FREE TEXT (no template) — just fan it out via `notifyRecipients(gw, filtered, () => message, {url:'/app'})`; workers get push if subscribed, else Telegram |

Load `listWorkers` once per request and derive `admins = workers.filter(w => w.admin)`.

## Testing
- **Unit (`web`):** `tf` — interpolation fills placeholders; a missing param yields empty (no `{x}` leak); a template with no placeholders is unchanged; HE-missing key falls back to EN. `notifyRecipients` — builds per-recipient lang (a RU admin gets the RU string, an EN admin the EN string), routes each via `notifyPhone` (push-vs-Telegram), never throws, tolerates an empty recipient list. Use a memory gateway + a stubbed sender.
- **Build/type:** `typecheck && build && test` green (RU exhaustiveness enforces every new key); `sw.js` still generated.
- **`test(review)`** pass, then a whole-branch review.
- **Manual:** trigger an early check-in as a worker → an admin gets it in their language (push if subscribed, else Telegram); send a broadcast → filtered workers get it push-first.

## Non-goals
- No new alert types or trigger changes — pure transport + copy migration.
- The Telegram webhook's inbound bot mechanics (callback answers, deep-link account linking) stay Telegram — they ARE the Telegram integration.
- Broadcast copy is not templatized (it's user-authored).
- No dedup changes (missed-checkin/offsite keep their `tryClaim`; the rest are event-idempotent or admin-initiated).

## Risks / notes
- RU exhaustiveness: every `alert.*` key added to EN must be added to RU (typecheck gate) — the implementer adds both.
- Per-recipient build means N message builds per alert (N = recipients) — trivial cost; admins are few.
- Push payload body is the built message (multi-line ok); title stays `'FlowCat'` unless a per-alert title is worth it.
- `worker.lang` may be blank → `resolveLang('')` defaults to `ru` (existing behavior), so a recipient with no set language gets Russian, matching the app default.
