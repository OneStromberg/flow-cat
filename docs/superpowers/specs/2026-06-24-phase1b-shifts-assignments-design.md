# Phase 1b — Shifts & Assignments — Design Spec

**Date:** 2026-06-24
**Status:** Approved design — ready for implementation plan
**Project:** `flow-cat` (Attendance+Payroll). See `docs/prd-discovery.md` and the Phase 1a spec.

## 1. Purpose

Turn flat location data into a scheduling model: **recurring shift templates**
that a **generator** expands into **dated instances**, plus a two-layer
**assignment** model (recurring intent + per-instance fact). This is the
foundation every later phase reads — check-in (hours of record), payroll,
the Kanban dashboard, the map, conflict detection, and "requiring staff".
All data in Google Sheets; the generator runs on Vercel Cron.

## 2. Key Decisions (locked)

| Decision | Choice |
|---|---|
| Instance production | **Materialize on a rolling horizon** (today … +6 weeks). |
| Generator trigger | **Vercel Cron nightly** + on-demand on template create/edit. |
| Assignment granularity | **Both** — recurring (template-level) seeds per-instance rows; **per-instance `ShiftAssignments` is the single source of truth**. |
| Recurrence | **Weekday mask + start/end + valid-from/valid-to.** Split/variable shifts = multiple templates. **Rotating patterns deferred to Phase 5.** |
| Instance IDs | Deterministic `<template_id>_<YYYYMMDD>` → generator is idempotent. |
| Location membership | Stays as the existing `Worker.places` (open-ended eligibility); distinct from shift assignment. |
| Eligibility check | **Soft warning only** (never blocks) — full warnings land with the Phase-3 dashboard. |
| Automated-job notifications | Generator sends a run summary to admins via **Telegram** (`notifyAdmins`). |

## 3. Data Model — four new Sheets tabs

**`ShiftTemplates`** — the recurring rule.

| Column | Meaning |
|---|---|
| `id` | short unique id (generator-safe slug) |
| `location` | references `Places.place_name` |
| `label` | e.g. `Day`, `Night` |
| `days` | comma weekday mask: `Mon,Tue,Wed,Thu,Fri,Sat,Sun` |
| `start` | `HH:MM` |
| `end` | `HH:MM` (overnight when `end < start`, reuse `computeHours` rule) |
| `headcount` | required staff count (integer) |
| `valid_from` | `YYYY-MM-DD` |
| `valid_to` | `YYYY-MM-DD` or blank (open-ended) |
| `active` | `yes`/`no` |

**`ShiftInstances`** — generated dated rows.

| Column | Meaning |
|---|---|
| `id` | `<template_id>_<YYYYMMDD>` (deterministic) |
| `template_id` | parent template |
| `location` | denormalized for easy querying |
| `date` | `YYYY-MM-DD` |
| `start` | `HH:MM` (copied from template at generation; frozen per instance) |
| `end` | `HH:MM` |
| `headcount` | copied from template (per-instance, so edits don't rewrite history) |
| `status` | `scheduled` / `cancelled` |
| `generated_at` | ISO timestamp |

**`RecurringAssignments`** — template-level intent (many employees ↔ many templates).

| Column | Meaning |
|---|---|
| `template_id` | the shift template |
| `employee_phone` | normalized worker key |
| `active` | `yes`/`no` |
| `created_at` | ISO timestamp |

**`ShiftAssignments`** — per-instance fact, the **source of truth**.

| Column | Meaning |
|---|---|
| `instance_id` | the dated instance |
| `employee_phone` | normalized worker key |
| `source` | `recurring` / `manual` / `claim` |
| `status` | `assigned` / `removed` (soft-remove keeps history) |
| `assigned_at` | ISO timestamp |
| `assigned_by` | admin phone (or `system` for generator-seeded) |

"**Requiring staff**" for an instance = count of `status=assigned` ShiftAssignments < `headcount`.

## 4. The Generator

`generateInstances(gateway, today: 'YYYY-MM-DD', horizonDays = 42)` — the core,
written as pure-as-possible logic over the gateway so it is unit-testable with
the memory gateway.

**Algorithm:**
1. Load active `ShiftTemplates`, existing `ShiftInstances` (by id), active
   `RecurringAssignments`, existing `ShiftAssignments`.
2. For each active template, for each date in
   `[max(today, valid_from) … min(today+horizon, valid_to or +∞)]` whose weekday
   ∈ `days`:
   - `instance_id = template_id + '_' + YYYYMMDD`. If it does not already exist,
     append a `ShiftInstance` (`status=scheduled`, copy start/end/headcount).
   - For each active `RecurringAssignment` on the template, ensure a
     `ShiftAssignment` (`source=recurring`, `assigned_by=system`) exists for
     `(instance_id, employee_phone)` — **unless** one already exists in any
     status (so a manual `removed` is respected and not re-seeded).
3. Return a summary: `{ templatesProcessed, instancesCreated, assignmentsSeeded, horizonEnd }`.

**Idempotency:** deterministic ids + existence checks ⇒ re-runs add only new
dates, never duplicate.

**Template edits (on-demand regeneration):** when a template is created or
edited, regenerate its **future** instances (date ≥ today): update `start`,
`end`, `headcount` on existing future instance rows (preserve their
assignments); add newly-valid dates; **past instances are frozen**. Deactivating
a template stops new generation; existing future instances remain (admin cancels
them individually).

**Cancel a single date:** `cancelInstance(instance_id)` sets `status=cancelled`
(row + assignments retained for the record).

**Trigger:**
- **Nightly:** Vercel Cron → `GET /api/cron/generate-shifts`, guarded by a
  `CRON_SECRET` bearer check (Vercel injects it). Calls `generateInstances(today)`
  then `notifyAdmins(summary)`.
- **On-demand:** the template create/edit admin route calls the
  regeneration path for that template (no Telegram notify — that's a
  user-triggered action, not an automated job).

## 5. Telegram admin notifications (minimal, 1b slice)

`packages/web/lib/telegram.ts` → `notifyAdmins(text: string): Promise<void>`:
- POSTs to `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage` once per
  id in `TELEGRAM_ADMIN_CHAT_IDS` (comma-separated env var).
- **Best-effort:** wrapped in try/catch; a Telegram failure logs server-side but
  never fails the generator job. No-op (logs a warning) if either env var is unset.
- Used by the cron route to send the generator run summary. Phase 4 will swap the
  env chat-IDs for sheet-bound per-user chat IDs and add worker linking/broadcasts.

**Convention recorded:** every future automated/scheduled job (alert poller,
nightly backup) calls `notifyAdmins` with its run summary.

## 6. Data Layer (worklog-core, new files)

- `data/shift-templates.ts` — `ShiftTemplate` type; `listTemplates`,
  `addTemplate`, `updateTemplate`; validation (≥1 valid weekday; valid `HH:MM`
  times; identical start==end rejected per existing overnight rule; `headcount`
  positive integer; `valid_from` ≤ `valid_to` when both set; `location` exists in
  `Places`).
- `data/shift-instances.ts` — `ShiftInstance` type; `generateInstances`
  (§4); `listInstances({ from, to, location? })`; `cancelInstance`.
- `data/shift-assignments.ts` — `RecurringAssignment` + `ShiftAssignment` types;
  `listRecurring(template_id)`, `addRecurring`, `removeRecurring`;
  `listAssignments({ instance_id? | employee_phone? })`, `assignManual`,
  `removeAssignment`, `claim`; the recurring-seeding helper used by the generator.
- All header-driven append/update via the existing `SheetsGateway`.

## 7. Admin UI (1b scope)

- **`/admin/shifts`** — template management: list templates; add/edit form
  (location `<select>` from active Places, label, weekday checkboxes, start/end
  time inputs, headcount, valid-from/to, active). Saving calls on-demand
  regeneration for that template.
- **Recurring-assignment editor** (per template): add/remove employees (from the
  template's location members, with a soft warning if outside `Worker.places` or
  failing `required_attributes`).
- **Generated-instances view** (read-only): list upcoming instances for a
  template/location with their assigned count vs headcount and a "requiring
  staff" flag — enough to verify generation.
- **Rich per-instance editing (manual add/remove, claims, drag) is the Phase-3
  Kanban dashboard.** The data-layer functions exist now; the dashboard wires
  their UI.

All admin-guarded (`requireAdmin`), `runtime='nodejs'`, `dynamic='force-dynamic'`.

## 8. Testing

- **worklog-core (the bulk):** `generateInstances` — weekday-mask expansion,
  valid-range clipping, horizon boundary, overnight instance, idempotent re-run
  (no dupes), recurring seeding, respects a manual `removed`, template-edit
  regeneration (future updated, past frozen), cancel. Template + assignment
  validation matrices. `listInstances` range/location filtering; "requiring staff"
  count.
- **web:** typecheck + build; the cron route's `CRON_SECRET` guard rejects
  unauthorized calls (unit-testable as a small pure guard if extracted; otherwise
  covered by typecheck + manual). `notifyAdmins` no-op-without-env path.

## 9. Out of Scope (this spec)

- Kanban dashboard, map, conflict detection (Phases 3) — though the data they
  read is produced here.
- Check-in/out and hours-of-record (Phase 2).
- Payroll using rates (Phase 2/5).
- Full Telegram bot: worker deep-link binding, two-way, segmented broadcasts
  (Phase 4). Only outbound `notifyAdmins` exists now.
- Rotating-pattern recurrence, open-shift self-claim UI, drag-to-reschedule,
  worker change-requests (Phase 5).
- Leave-driven "requiring staff" (Phase 5 leave; the headcount-based flag exists
  here).
