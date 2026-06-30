# PM Feedback Batch 4 — Design

**Date:** 2026-06-30
**Goal:** 10 items from the PM's batch-4 list. One spec → one plan → SDD → single merge. Builds on batch-3 (TZ helper, per-place grace, shift colors, geofence fields).

## Decisions (settled with PM)
- **Pay model:** everyone is **hourly**. Force `hourly` in payroll/reports; remove the structure selector from the worker form so a flat value can't be set (root cause of the recurring "=37").
- **Geofence:** **hard block** check-in outside the place's radius; per-place radius is the lever.
- **Shift grouping:** **collapsible per-object sections** in the views.
- **Broadcast:** pick a **specific shift instance** and send its details to a segment.
- **Presence (2.3):** "present" = a **currently-open** attendance row (checked in, not out), evaluated within the shift window.

---

## Shared refinement: "currently present" vs "ever checked in"

Batch-3 `shiftStatusColor` used `checkedIn` = distinct workers with ANY attendance row (open/closed/corrected). The PM's 2.1/2.3 require **current presence**: a worker who checked out early is no longer present, so the shift must revert to orange during the window. Change the model to **`presentNow`** = count of distinct workers with an **OPEN** attendance row for the instance, and bring `end` back so we know if the window is still active.

New `shiftStatusColor` inputs: `{ status, assigned, headcount, presentNow, date, start, end, nowISO, tz, graceMins }` (replaces `checkedIn` with `presentNow`, restores `end`).

Precedence:
1. `cancelled` → gray
2. not started (`now < start+grace`) → `assigned >= headcount` ? green : yellow
3. within window (`start+grace ≤ now < end`):
   - `assigned < headcount` → red (understaffed on paper)
   - `presentNow >= headcount` → green
   - else → **orange** ("started, absent" — covers nobody-showed AND early-checkout)
4. after end (`now ≥ end`) → `assigned < headcount` ? red : green (window over; presence no longer demanded)

`end` instant via `localWallClockToUTC(endDate, end, tz)` with the existing overnight (`end < start` ⇒ next day) handling. The shift pages compute `presentNow` = distinct phones with `status === 'open'` per instance (replacing the batch-3 `checkedInMap`).

---

## Items

### 2.1 — Week as the default view
The view-switcher defaults to its current mode (month/day). Default it to **`week`**. One-line change in the switcher's initial state.

### 2.2 — Collapsible per-object grouping
In the shift views (Week especially), group the day's shifts by **location** into collapsible sections, each showing `location · assigned/headcount summary`. Collapsed state is local UI (per-section toggle). Scales to 20+ objects. Keep the existing per-shift chips inside each group.

### 2.3 — Early checkout returns shift to "started, absent"
Covered by the shared `presentNow` refinement above: once the only present worker checks out before `end`, `presentNow` drops below `headcount` and the shift shows orange until someone re-checks-in. No separate code beyond the color-model change + the page computing `presentNow` from open rows.

### 3.1 — Place → template links
The place card already lists this location's templates. Make each template a link to its page. **Check first** whether a shift-template view/edit page exists (`/admin/shifts/...`); if one does, link to it; if not, link to the closest existing template surface (e.g. the template's edit form) — do not build a new page unless none exists (flag if so).

### 3.2 — Editable places (radius + fields)
Places are currently **add-only** — no way to change a radius after creation. Add an **edit-place** flow: an edit form (reuse the add-place form fields) + a route branch that updates the existing `Places` row (find by `place_name`, `updateRow`). Reachable from the place card / list. The geofence radius + grace already exist as fields; this makes them (and the rest) editable.

### 4.1 / 4.2 — Attendance times: Jerusalem, time-only, date once
The admin attendance table prints the raw UTC ISO in the Check-in/Check-out columns (wrong TZ + duplicates the Date column). Render those two columns as **time-only in Asia/Jerusalem** (`HH:MM`), leave the Date column as the date. Add a small formatter (Intl, `timeZone: COMPANY_TZ`, hour/minute). Empty checkout stays `—`.

### 5.1 — Force hourly + remove structure selector
Code is correct; the recurring "=37" is a flat `pay_structure` saved via the worker form. Decision = all-hourly. Changes:
- Payroll page + reports route: replace `(w.payStructure || 'hourly')` with `'hourly'`.
- Worker add + edit forms: **remove the Pay structure selector** (keep Pay rate as the hourly rate). Leave the `pay_structure` column/field in the data layer (harmless; no migration), but stop writing/选ecting it from the UI.
- `computePay` is unchanged (still supports structures for any future need; just not surfaced).

### 2.4 — Delete a shift template
Templates carry an `active` flag (`yes`/`no`) and the generator seeds only active ones, so **delete = soft-delete** (`active='no'`), no row removal (matches the append-only model). Changes:
- `deleteTemplate(gateway, id)` in `shift-templates.ts` — find by id, set `active='no'` via `updateRow` (mirror `updateTemplate`'s row-find).
- Confirm `generateInstances` skips inactive templates (it loads `listTemplates`); if it doesn't already filter `active`, add the filter so a deleted template stops generating new instances.
- Hide inactive templates from the template list / place card.
- A **Delete** button (with a confirm) on the template surface → calls a route that invokes `deleteTemplate`.
- **Existing future instances are left as-is** (not cascade-cancelled) — deleting the template stops *new* generation; staffed/standing shifts aren't silently removed. (Flag if the PM wants cascade-cancel of future unstaffed instances.)

### 8.1 — Broadcast a specific shift instance
On the broadcast page, add a mode: pick an upcoming **shift instance** (place + date + time + headcount) from a list; prefill the message with its details (editable); send to the selected worker segment via the existing broadcast path. No new send mechanism — just compose-from-shift.

### client-1 — Hard block out-of-geofence check-in
Check-in currently records `inGeofence` and warns but completes. Change the **check-in** action (`action === 'in'`) in the check-in route to **reject** when `inGeofence === false` (place has coords and worker is outside `geofenceRadiusM`), returning a clear error ("You're outside <place>'s allowed area — move closer or ask your manager to widen the radius."). Checkout is NOT blocked (a worker must be able to check out). If the place has no coords, behavior is unchanged (can't enforce). The client surfaces the error instead of the soft warning.

### Telegram — early-checkout alert (NEW)
PM alert #2: notify admins when a worker checks out **before** the scheduled `end`. Fire **immediately at checkout** in the check-in route (`action === 'out'`): after a successful `checkOut`, if `now < end-instant` (TZ-correct), `notifyAdmins('⚠️ <name> checked out early at <place> (<HH:MM>, shift ends <HH:MM>) — 📞 <phone>', adminChatIds)`. No scheduler needed. PM alert #1 ("started, nobody showed") already exists in `findMissedCheckins` (type `in`) — no new code, still gated on the external scheduler being on.

---

## Out of scope / notes
- Missed-checkin **scheduler** is still user setup (the existing cron endpoint).
- Removing the structure selector does not migrate existing flat workers' data; forcing `hourly` at compute time makes their pay correct regardless.

## Testing
worklog-core changes (color model, any helper): Node test runner. web: typecheck + build. Early-checkout alert + geofence block: unit-test the pure decision (is-early / is-outside) where extracted; otherwise route-level + build.
