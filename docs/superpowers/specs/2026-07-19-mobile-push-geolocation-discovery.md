# Mobile Push Notifications + GPS Tracking — Discovery & Best Practices

**Date:** 2026-07-19
**Goal:** Map FlowCat's current GPS/geofence + notification functionality, and lay out best practices for the mobile direction (installable PWA + Web Push, location integrity, background tracking). This is a **discovery/reference doc** feeding a later implementation plan — not a single-feature change design.

## TL;DR — two decisions that shape everything
1. **Push → PWA + Web Push is the right call.** Cleanly retires the Telegram overhead, works within browser limits, and pairs with the service worker we'd add anyway. Low risk.
2. **GPS is where the PWA hits a wall.** Reliable *background* location + geofence tracking for a guard whose phone is locked is **not achievable in a browser**. More urgently: the check-in server **trusts any lat/lng the client sends** (`checkin/route.ts` never validates accuracy, freshness, or mock-GPS) — a fraud vector for a payroll app. Push is a straightforward upgrade; location integrity needs an architectural decision.

Recommended framing: **PWA + Web Push now for notifications; reserve Capacitor specifically for background geolocation + mock-location detection** if reliable on-site tracking becomes a hard requirement. Do NOT adopt Capacitor for push.

## Current state — GPS / geofence
| Aspect | Today | Source |
|---|---|---|
| Capture | `getCurrentPosition`, `enableHighAccuracy`, fresh fix (`maximumAge:0`); **only lat/lng kept** | `packages/web/app/app/checkin/checkin-client.tsx:208-227` |
| Distance/threshold | Haversine `distanceMeters`; `withinGeofence = dist ≤ radius` | `packages/worklog-core/src/data/attendance.ts:44-57` |
| Radius | `geofence_radius_m` per place, default **100 m** | `packages/worklog-core/src/data/places.ts:70` |
| Enforcement | **Hard HTTP 422** `outside_geofence` on both in/out, before photo upload; places without coords are never enforced | `packages/web/app/api/checkin/route.ts:82-103` |
| Continuous | Foreground-only poller → `/api/geo/ping`; 30 min in-zone / 5 min off-site adaptive cadence | `packages/web/app/app/checkin/geo-poller.tsx`, `packages/web/app/api/geo/ping/route.ts:104` |
| Storage | `check_in_lat/lng/in_geofence` (+ out equivalents) as strings on the `Attendance` tab | `packages/worklog-core/src/data/attendance.ts:22-27` |
| Integrity | **None** — `accuracy`, `timestamp`, `isMock` never read; client coords fully trusted; no server-side time-stamp | — |

Notes: no `watchPosition` anywhere; the poller's own comment (`geo-poller.tsx:5`) acknowledges browsers pause its timers when the tab is suspended → **no true background tracking**.

## Current state — notifications
| Aspect | Today | Source |
|---|---|---|
| Transport | Telegram only, centralized but **no channel abstraction** (every call site imports Telegram fns) | `packages/web/lib/telegram.ts` |
| Triggers | early in/out, very short shift, coverage gap (sync at check-in/out); offsite (geo-ping); missed check-in/out (cron); shift-gen + backup (cron) | `checkin/route.ts:126-193`, `geo/ping/route.ts:78-102`, `cron/*` |
| Recipients | admins = workers with `admin=yes` + linked `telegram_chat_id`; `pickAdminChatIds(listWorkers())` **re-reads the whole Workers sheet per alert** | `packages/web/lib/telegram.ts:27-31`, `packages/worklog-core/src/data/workers.ts:141-167` |
| Linking | HMAC deep-link `/start <token>` → `linkTelegramChat` writes `telegram_chat_id` | `packages/web/lib/telegram-link.ts`, `packages/web/app/api/telegram/webhook/route.ts:51-61` |
| Copy | **hardcoded per call site**, mixed EN/RU, **bypasses the i18n dict** (`lib/i18n/strings.ts` covers UI only) | throughout |
| Dedup | offsite alert dedup via in-memory `lastAlertAtByKey` — **resets on serverless cold start** → duplicate alerts | `packages/web/app/api/geo/ping/route.ts:80-98` |
| Scheduling | Vercel cron is daily-only (`vercel.json` has generate-shifts + backup); **missed-checkins depends on an external scheduler** hitting the URL with `CRON_SECRET` | `packages/web/vercel.json:4-13` |
| PWA | manifest only (`app/manifest.ts`), `display: standalone`; **no service worker, no next-pwa, no Web Push** | `packages/web/app/manifest.ts`, `next.config.ts` |

## Best practices — GPS / location tracking

### A. Location integrity (highest priority — payroll)
A guard can feed the site's coordinates via devtools/emulator and clock in from home; the geofence is cosmetic against anyone motivated. Can't be fully closed in-browser, but raise the bar in layers:
- **Capture and use `accuracy`.** Currently discarded. A 100 m geofence decided by a ±80 m fix is noise. Decide with `distance - accuracy ≤ radius`, and **flag** (don't silently accept) fixes whose accuracy is worse than the radius. Persist accuracy for dispute audits.
- **Capture `timestamp`, stamp receipt server-side, bound clock skew** → rejects replayed/stale coordinates.
- **Cross-check the continuous poller against the clock-in point** and detect **impossible movement** (ping-to-ping speed > threshold ⇒ teleport/spoof). Consistency over time is far harder to fake than one point.
- **Lean on the existing photo** — a timestamped on-site selfie is the strongest secondary signal; consider making it mandatory at clock-in.
- **`isMock` / mock-location is not exposed to web JS** — only a native layer reads it. This is the single most concrete reason a guard app eventually wants Capacitor.

### B. Background tracking — the honest limitation
- `watchPosition` / `setTimeout` pollers **pause when the tab is hidden or the screen locks** → for a guard who pockets the phone, on-site tracking effectively stops.
- Browsers have **no OS geofence API** (the battery-efficient "wake on region enter/exit" primitive is native-only). Polling drains battery *and* misses events.
- Options, by effort:
  1. **Accept foreground-only** and design around it — require the app on-screen during shifts, periodic "still here?" confirmations. Cheapest, honest.
  2. **Capacitor + background-geolocation plugin** (`@capacitor-community/background-geolocation`, or Transistorsoft for heavy-duty) → true background, OS geofence events, and `isMock`. Correct tool if reliable on-site presence must be guaranteed.

### C. Geofence decision quality
- **Fold accuracy into pass/fail** (§A) instead of a hard binary on raw distance.
- **Hysteresis / dwell** on the "left site" alert — require N consecutive off-site pings or M minutes before firing, so one bad fix doesn't page an admin (extend the existing `graceMins` idea on places to the poller).
- **Persist raw distance + the decision**, not just a yes/no flag — payroll disputes need the evidence.

### D. Privacy / legal (Israel privacy law ≈ GDPR posture)
- **Track only during an open shift** (already gated on open attendance — keep that invariant).
- Explicit **consent**, data minimization, a **retention policy**, transparency to workers. Continuous employee location tracking is legally sensitive; bake in up front.

## Best practices — push notifications

### A. Introduce a `Notifier` abstraction (this *is* the "overhead")
The pain isn't Telegram — it's that transport, recipient resolution, and message copy are fused at every call site.
- Define a channel-agnostic `Notifier` in `worklog-core` (`notify(recipient, event)`), with `telegram` + `webpush` implementations behind it. Call sites emit **events**, not Telegram strings.
- **Move notification copy into the existing i18n dict** (RU/EN/HE) and templatize by event. Today it's duplicated and language-inconsistent.
- Unlocks a **fallback chain**: Web Push → Telegram → (SMS) per recipient's available channels.

### B. Web Push implementation (the pieces)
VAPID keys → service worker `push` + `notificationclick` handlers → client subscribe on a user gesture → store `PushSubscription` per worker (multiple devices) in Firestore → server sends via `web-push`, **pruning on 404/410** + handling `pushsubscriptionchange`. Load-bearing constraints:
- **iOS 16.4+ delivers push only to an *installed* PWA**, never a Safari tab. For iPhone guards, "Add to Home Screen" is a hard prerequisite — decide whether to mandate it or keep Telegram as their fallback.
- We have **no service worker today**; adding Web Push means adding the SW (next-pwa/Serwist), which also gives installability + offline. Two-for-one.
- **Actionable notifications**: Web Push action buttons via `notificationclick` reach **full parity** with the Telegram "Accept shift" inline keyboard.

### C. Delivery reliability (fixes real bugs, not just style)
- **Move dedup state out of memory** → persist dedup keys in Firestore (the `Alerts` tab already models this; reuse `lastAlertAtByKey`-style time-based dedup). Fixes duplicate offsite alerts on cold start.
- **Stop re-reading the whole Workers sheet per alert** — cache/index chat IDs + push subscriptions.
- **Fan out with bounded concurrency** (`Promise.allSettled`) instead of a serial loop.
- For repeating missed-checkin alerts, prefer a **durable queue** — we're already in GCP, so **Cloud Scheduler + Cloud Tasks** keeps scheduling reliable and in one cloud, replacing the fragile external cron.

### D. Permission & audience strategy
- **Prime before prompting** — in-app "turn on shift alerts" explainer, then request permission on the tap. Never auto-fire on load; denial is permanent-ish.
- **Route by audience**: Web Push to *workers* removes the Telegram-linking friction (no `/start` deep-link onboarding); keep Telegram for *admins* who prefer it, or migrate both behind the `Notifier`.

## Prioritized roadmap
| # | Item | Effort | Payoff |
|---|---|---|---|
| 1 | Persist notification dedup + stop full-sheet reads on fanout | S | Kills duplicate-alert noise (bug fix) |
| 2 | `Notifier` abstraction + i18n'd templates | M | Removes the Telegram "overhead"; enables Web Push |
| 3 | Web Push (SW + VAPID + subscriptions) alongside Telegram | M | Drops per-worker linking friction |
| 4 | Capture/store/validate `accuracy` + `timestamp`; flag low-confidence fixes | S–M | Real location integrity for payroll |
| 5 | Impossible-movement detection + poller hysteresis | M | Fewer false alerts, harder to spoof |
| 6 | Cloud Scheduler + Tasks for missed-checkins | S | Reliable scheduling in GCP |
| 7 | *Decision:* Capacitor for background geolocation + mock detection | L | Only if reliable on-site tracking is a hard requirement |

Items 1–3 retire the Telegram overhead and stand up Web Push; 4–6 harden location without leaving the web; 7 is the one genuine "go native" decision, scoped strictly to background GPS.

## Open decisions
- **iOS push:** mandate PWA install for iPhone guards, or keep Telegram/SMS as their fallback?
- **Background GPS:** accept foreground-only (design around it) vs commit to Capacitor (item 7)?
- **Migration:** run Web Push and Telegram in parallel behind the `Notifier`, or hard-cut workers to Web Push once adoption is proven?

## Next step
Brainstorm + write an implementation plan for the self-contained slice that kills the Telegram overhead: **items 1–3** (dedup bug fix → `Notifier` abstraction + i18n templates → Web Push). Items 4–6 (location hardening) and item 7 (Capacitor decision) are separate plans.
