# PM Batch 5 — Phase C1 (notifications) — Design

**Date:** 2026-07-06
**Goal:** The batch-5 notification set that does NOT depend on background geolocation. ("Not on site" is deferred to the geoloc sub-phase.)

## Existing infra
- `findMissedCheckins` + `Alerts` tab dedup (`listSentAlerts`/`recordAlerts`) + `/api/cron/missed-checkins` — currently alerts a missed check-in/out ONCE (permanent dedup).
- Early-checkout alert already fires in `checkin/route.ts` on ANY early checkout (batch 4).
- `notifyAdmins` + `pickAdminChatIds`; `localWallClockToUTC` for TZ-correct shift instants.

## Notification rules

### 1. Missed check-in — repeat every 5 min until the worker checks in
Today the `Alerts` dedup keys on `instanceId|phone|type` permanently → one alert ever. Change to **time-based** re-alerting: re-send a missed-`in` alert if the last alert for that key was ≥5 min ago and the worker still hasn't checked in (`findMissedCheckins` stops returning it once they check in, so it self-terminates).
- Add `lastAlertAtByKey(gateway): Promise<Map<string, string>>` (key `instanceId|phone|type` → latest `sent_at` ISO) reading the `Alerts` tab.
- Cron: for each currently-missed event, alert if there is NO prior alert OR `now - lastSentAt ≥ 5 min`; then `recordAlerts` (append a new dated row each time). Applies to `type:'in'` (the "repeat until check-in" requirement); keep `type:'out'` as-is (single) unless trivially covered.

### 2. Early check-OUT — only when >15 min before scheduled end
Refine the existing `checkin/route.ts` early-checkout alert: fire only when `endMs - Date.parse(at) > 15*60000` (was: any early checkout). Message unchanged.

### 3. Early check-IN — >15 min before scheduled start
New, at check-in (`action==='in'`, after a successful `checkIn`): if `startMs - Date.parse(at) > 15*60000`, best-effort `notifyAdmins('⏱ <name> checked in early at <place> (<HH:MM>, shift starts <start>) — 📞 <phone>')`. TZ-correct `startMs` via `localWallClockToUTC(instance.date, instance.start, COMPANY_TZ)`.

### 4. Suspiciously short shift — <10 min between check-in and check-out
New, at checkout (`action==='out'`, after a successful `checkOut`): if `Date.parse(at) - Date.parse(checkInAt) < 10*60000`, best-effort `notifyAdmins('⚠️ <name> very short shift at <place> (<Nmin>) — 📞 <phone>')`. (Phase B already BLOCKS <60s; this ALERTS on 1–10 min.) Read the checkout row's `check_in_at` for the delta.

### 5. Coverage gap — departing worker left before the replacement arrived
Best-effort, at checkout (`action==='out'`): if there is a **following** shift instance at the SAME location whose scheduled window is current/imminent (starts within, say, the next 30 min or already started) and whose assigned worker(s) are a DIFFERENT person who is NOT currently checked in (no open attendance row), alert `'🔁 Coverage gap at <place>: <departing> left before the next shift''s worker checked in — 📞 <departing phone>'`. Requires loading today's instances at that location + their assignments + open attendance. Scoped, best-effort (wrapped so it never fails the checkout). If the consecutive-shift detection proves ambiguous, emit nothing (no false alarms).

## Notes
- Rules 2–5 fire **synchronously** at check-in/out — no scheduler needed. Rule 1 (repeat) needs the every-5-min cron running (still user setup). Flag that repeating alerts only fire once the scheduler is on.
- All admin alerts are **best-effort** (try/catch; never fail the worker's check-in/out).
- Thresholds (5/10/15 min) as literals for now; a per-place/global config is a later concern.

## Out of scope
"Not on site" (needs geoloc → geoloc sub-phase). Multi-shift-per-day templates, broadcast-with-buttons (their own sub-phases).

## Testing
worklog-core (`lastAlertAtByKey`, any extracted pure predicate like `isEarly`/`shortShiftMins`): Node test runner, TDD. web (checkin route + cron): typecheck + build; extract pure decisions where practical so they're unit-tested.
