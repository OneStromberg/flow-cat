# PM Feedback Batch 3 — Design

**Date:** 2026-06-29
**Goal:** Fix 4 bugs + ship 6 small features from the PM's latest list. One spec → one plan → SDD → single merge.

Payroll item 5.1 is **out of scope** (data, PM is handling it directly).

## Decisions (settled with PM)
- Missed-checkin alerts stay **Telegram only** (already built; needs the external scheduler turned on + per-place grace).
- Status legend: 🟢 checked-in · 🟠 assigned but not checked-in (shift started) · 🟡 unassigned + upcoming · 🔴 unassigned + ongoing/past · ⚪ cancelled.
- Headcount cap **blocks** the (N+1)th check-in.
- Grace period is a **per-Place** field, overriding a global default.

---

## Shared foundation: timezone-correct "now"

**Root cause of 2.1 (and a latent bug in missed-checkins):** Shift `start`/`end` are stored as **Asia/Jerusalem wall-clock** strings (`"08:00"`), but the code compares them against a **UTC** "now". `shift-colors.ts` compares the UTC `nowISO` string to `${date}T${start}`; `missed-checkins.ts` parses `${date}T${start}:00Z` (local time mislabeled as UTC). Both are off by the TZ offset (+2/+3h), so a shift that started locally reads as "upcoming".

**Fix:** one pure helper, `localWallClockToUTC(date, hhmm, tz): string` (returns the UTC ISO instant for that local wall-clock), in `worklog-core/src/time/`. Reused by:
- `missed-checkins.ts` — replace `startMs`/`endMs`'s `:00Z` parse.
- `shift-colors.ts` — convert `start`/`end` to UTC instants before comparing to the real `now`.

Offset derived via `Intl.DateTimeFormat` (no new dependency).
`// ponytail: ignores the once-a-year DST transition hour; not worth a tz lib for shift coloring.`

---

## Bugs

### 1.1 — Russian-letter (Cyrillic) search returns nothing
`filterWorkers` lowercases both sides, but Cyrillic text stored in one Unicode normalization form and typed in another fails `.includes`.
**Fix:** `.normalize('NFC')` both the haystack and the search term in `filterWorkers` (`packages/web/lib/filter-workers.ts`). Add a test with a decomposed-vs-composed Cyrillic name.

### 2.1 — Started shift shows "Upcoming"/yellow
Covered by the shared TZ fix above. `shiftStatusColor` uses TZ-correct now; the page passes the real UTC `now` (it already does) and the place's `tz` (COMPANY_TZ).

### 4.1 — Attendance hours correction reverts to original
`adminCorrect` recomputes `hours` from both timestamps whenever both are present, so a typed `hours` (the only field the inline edit sends) is ignored on a closed row.
**Fix:** if `fields.hours` is explicitly provided, honor it; only auto-recompute when `hours` is absent **and** both timestamps changed. File: `packages/worklog-core/src/data/attendance.ts`. Update/extend `attendance.test.ts`.

### Worker-client 1 — block future-dated manual entries
The manual worklog entry form already receives `today` (`todayISO(COMPANY_TZ)`).
**Fix:** (a) set `max={today}` on the date widget so the picker blocks it client-side; (b) reject `date > today(tz)` server-side in the submit/validate path (`submit-worklog` / `validate-answers`) so it can't be bypassed. Tests for the server reject.

---

## Features

### 2.2 — "Assigned but not checked-in" status (+ TZ)
`shiftStatusColor` gains two inputs: `checkedIn: number` (attendance rows for the instance) and `graceMins: number`. New precedence:
1. `cancelled` → gray
2. `assigned < headcount` → red if started (now ≥ start+grace), else yellow
3. `assigned ≥ headcount` → green if `checkedIn ≥ headcount`; else orange if started, else green (fully staffed, not started yet)

Add `'orange'` to `ShiftStatusColor` + its chip class (amber-600/orange). Shift list/month/week/day pages compute `checkedIn` per instance and pass `graceMins` (per-place, below). Tests for each branch.

### 2.3 — Per-place grace period
Add a `grace_mins` column to `Places` (`PLACES_COLUMNS`, `Place`, `AddPlaceInput`, the add/edit place form). Empty ⇒ fall back to the global default (10). A resolver `placeGraceMins(place, default=10)`. Wire it into `findMissedCheckins` (look up the instance's place grace) and into the 2.2 color computation. No channel change — Telegram only.

### 2.4 — Headcount cap on check-in
`checkIn` (`attendance.ts`) currently rejects only a second *open* row for the same (instance, phone). Add: count distinct workers with any attendance row (open/closed/corrected) for the instance; if `>= headcount`, reject new workers with `{ ok:false, error:'shift is full' }`. A worker who already has a row for the instance is unaffected (can re-check-in). Needs the instance's `headcount`. Test full/not-full/same-worker-again.

### 3.1 — Minimal map style
The interactive map shows all Google POIs, drowning our markers.
**Fix:** pass a `styles` array to the `Map` that hides `poi`, `transit`, and business labels (keep roads/geometry). In `map-client.tsx`. `// ponytail: static style array, no UI toggle.`

### 3.2 — Place detail card
New `/admin/places/[name]` page (analog of the worker card). Shows the place's description (reuse the existing `notes` field — no new column), address/contact/client/geofence, Waze + Maps links, and the shifts at this location: its templates + upcoming instances (with assigned/headcount). Link to it from the places list. Read-only (edit stays on the existing add/edit place page).

### 9.1 — Reports: filter by location / employee
The report builder aggregates by date range only. Add optional **location** and **employee** filters to the route + the reports form: when set, scope the input attendance set before aggregating. Files: the reports API route + `reports-client.tsx`. Tests for the filtered aggregation.

---

## Out of scope
- 5.1 payroll (data; PM handling).
- SMS / WhatsApp channels (Telegram only, per decision).
- The missed-checkin **scheduler** itself is user setup (Cloud Scheduler / cron-job.org hitting `/api/cron/missed-checkins`) — documented already, not a build task.

## Testing
worklog-core changes: Node test runner (`pnpm --filter @scourage/worklog-core test`). web: typecheck + build. Each bug fix and feature lands with its covering test.
