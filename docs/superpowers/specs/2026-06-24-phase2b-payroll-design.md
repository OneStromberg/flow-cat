# Phase 2b — Payroll & Adjustments — Design Spec

**Date:** 2026-06-24
**Status:** Approved design — ready for implementation plan
**Project:** `flow-cat`. See `docs/prd-discovery.md` (§5). Consumes Phase-2a `Attendance` hours.

## 1. Purpose

Compute pay for a date range from attendance hours, with a rate model (employee →
shift-type → location precedence), multiple pay structures, and admin-entered
bonuses/penalties. Pure, unit-tested computation; an admin payroll view.

## 2. Key Decisions (locked, discovery §5)

| Decision | Choice |
|---|---|
| Rate precedence (hourly) | **employee rate → shift-type rate → location base rate** → 0. |
| Pay structures | `hourly` / `fixed_shift` (per shift) / `per_day` / `monthly` / `piece`. |
| Bonuses/penalties | Admin-entered: amount + reason + date + type (bonus/penalty), attached to an employee; included in a period when the entry `date` falls in `[from,to]`. |
| Pay period | A `{from,to}` date range the admin picks (covers weekly / bi-weekly / monthly). |
| Currency | **ILS**. |
| Hours source | Phase-2a `Attendance` (closed/corrected rows). |
| `piece` | Out of scope for auto-compute (no piece counts tracked) — shown as `manual`; admin uses bonuses to add piece pay for now. |

## 3. Data Model

- **Workers tab — new columns:** `pay_structure` (`hourly`/`fixed_shift`/`per_day`/`monthly`/`piece`, default `hourly`), `pay_rate` (number; meaning depends on structure — per hour / per shift / per day / per month).
- **ShiftTemplates tab — new column:** `rate` (optional shift-type hourly rate; blank ⇒ fall through to location base).
- **New `Adjustments` tab:** `id`, `employee_phone`, `date`, `type` (`bonus`/`penalty`), `amount`, `reason`, `created_by`, `created_at`.
- Places `base_rate` already exists (Phase 1a).

## 4. Data Layer (worklog-core) — `data/payroll.ts`

Pure, testable:
- `interface PayStructure` enum list `PAY_STRUCTURE` (`{value,label}[]`).
- `resolveHourlyRate(employeeRate: string, templateRate: string, locationRate: string): number` — first non-blank-numeric > 0 wins; else 0.
- `interface WorkedItem { date: string; hours: number; rate: number }` (rate pre-resolved by the caller).
- `interface Adjustment { id; employeePhone; date; type; amount: number; reason; }`
- `computePay(structure: string, payRate: number, items: WorkedItem[], adjustments: Adjustment[]): PayBreakdown` where
  `PayBreakdown = { gross: number; bonuses: number; penalties: number; net: number; basis: string }`:
  - `hourly`: gross = Σ(hours × rate).
  - `fixed_shift`: gross = items.length × payRate.
  - `per_day`: gross = (distinct dates).count × payRate.
  - `monthly`: gross = payRate (flat for the period).
  - `piece`: gross = 0, basis `'manual'`.
  - bonuses = Σ adjustments type=bonus; penalties = Σ type=penalty; net = gross + bonuses − penalties. All rounded to 2dp.
- `listAdjustments(gateway, { employeePhone?, from?, to? })`, `addAdjustment(gateway, input)` (validates amount numeric > 0, type ∈ bonus/penalty, employee/reason required).

Workers `pay_structure`/`pay_rate` parsed in `parseWorker`; `addWorker`/`WORKERS_COLUMNS` extended; ShiftTemplate `rate` parsed + in template CRUD.

## 5. Admin Payroll View — `/admin/payroll`

- `requireAdmin`. Inputs: `from`/`to` (default current month). For each active worker:
  - Load their closed/corrected `Attendance` in range; for each, resolve the hourly rate via `resolveHourlyRate(worker.payRate, template.rate, place.baseRate)` (look up template + place from the instance) → build `WorkedItem[]`.
  - Load their `Adjustments` in range.
  - `computePay(worker.payStructure, Number(worker.payRate), items, adjustments)`.
  - Row: name · structure · hours · gross · bonuses · penalties · **net (ILS)**.
- A totals row. An **"Add adjustment"** form (employee select, type, amount, reason, date) → `POST /api/admin/adjustments`.
- Excel/report export is Phase 5; this view is on-screen + the adjustment entry.

## 6. Security & Testing

- `requireAdmin` on the page + `/api/admin/adjustments`.
- **Tests (worklog-core):** `resolveHourlyRate` precedence (employee/template/location/zero); `computePay` each structure (hourly, fixed_shift, per_day distinct-dates, monthly flat, piece→0) + bonuses/penalties/net rounding; `addAdjustment` validation; `parseWorker` new fields.
- web: typecheck + build.

## 7. Out of Scope

- Excel export + reporting (Phase 5).
- Overtime/night/holiday multipliers, Israeli-labor-law specifics (future).
- Period locking/finalization (Phase 5 reports, or a later hardening).
- Auto piece-rate (manual via adjustments for now).
