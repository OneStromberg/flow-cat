# PM Batch 5 — Phase C2 (multiple shifts per day in a template) — Design

**Date:** 2026-07-06
**Goal:** Let a template define 2+ shifts on the same weekday (e.g. Mon 06:00–18:00 AND Mon 18:00–06:00). Feature #3.

## Current state
- `DayTime { day, start, end }`; `dayTimes: DayTime[]`; serialized `day=start-end;…` and parsed back — the ARRAY already supports two entries with the same `day`.
- **Blockers:** (1) generation collapses via `dayMap = new Map(dayTimes.map(d => [d.day, d]))` → one slot/day (last wins); (2) instance id `${tpl.id}_${compact(date)}` **collides** for two same-day slots; (3) the template editor UI likely allows one time per day.

## Design

### Instance identity + idempotency (the careful part)
- New instance id includes the slot start: **`${tpl.id}_${compact(date)}_${start.replace(':','')}`** (e.g. `t1_20260706_0600`, `t1_20260706_1800`).
- **Idempotency by composite `template_id|date|start`, NOT by id string.** Build the "already exists" set from the sheet keyed on `(template_id, date, start)`. This makes the id-scheme change safe: an existing OLD-format instance (`t1_20260706`, start `08:00`) is recognized by its `(t1, 2026-07-06, 08:00)` composite → NOT duplicated when new-scheme generation runs. Old instances keep their old ids (assignments/attendance reference them fine); only *additional* slots get new-format ids. Mixed id formats coexist harmlessly.

### Generation (generateInstances + seedTemplateInstances)
- Replace `dayMap.get(wd)` (one slot) with: iterate ALL `tpl.dayTimes` whose `day === wd` → for each slot, compute the slot instance id, and create it if `(template_id|date|start)` isn't already present. Seed recurring assignments into each slot's instance (recurring is per-template, so all slots of a day get the template's recurring workers — confirm that's the intended behavior; if a recurring worker should only cover one slot, that's a future refinement — note it).

### applyTemplateEdit (propagating a template time edit to future instances)
- Match each future scheduled instance to a template slot **by the instance's stored `start`** (weekday + start ∈ the template's slots for that weekday). Update only fields that changed for that matched slot (end, headcount). If the edit CHANGED a slot's start time, the old instance won't match any slot → leave it (generation creates a fresh instance for the new start; the stale one can be cancelled by the admin). This is multi-slot-safe (no mis-assignment / corruption); note the "changed-start leaves a stale instance" limitation.

### Editor UI (add-template-form + the edit form in template-detail)
- Allow adding **multiple time rows for the same day**: a per-day list of `{start, end}` slots with an "add slot" affordance, serialized into `dayTimes` (multiple entries with the same `day`). Keep the existing single-slot flow working (one slot/day is just the common case). Confirm the form builds `dayTimes: DayTime[]` allowing repeats of a day.

## Notes
- Recurring assignments are per-template → seeded into every slot of a matching day. If per-slot recurring is ever needed, that's a later change (flagged).
- Color/broadcast/etc. already operate per-instance, so they need no change — each slot is just another instance.

## Testing
worklog-core (generation with 2 slots/day → 2 instances; composite idempotency incl. an old-format existing instance not duplicated; applyTemplateEdit slot-matching): Node test runner, TDD. web (editor multi-slot): typecheck + build.
