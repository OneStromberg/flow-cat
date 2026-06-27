# UX Part A — App Shell (Nav + Mobile Filters) — Design Spec

**Date:** 2026-06-27
**Status:** Approved — ready for plan
**Project:** `flow-cat`. Mobile-first.

## 1. Purpose
Consistent bottom-tab navigation across admin and worker areas, and convert the
worker filter chips to multi-select dropdown checklists. Pure presentation —
no data-model changes.

## 2. Decisions (locked)
- **Bottom tab bar** for both areas (mobile-first, thumb-reachable, `usePathname` active state).
- Worker filters become **multi-select checklist dropdowns** (keeps OR-within-field; `filterWorkers` unchanged).

## 3. Admin nav — `app/admin/layout.tsx`
- Server-component layout wrapping all `/admin/*` pages. Renders `<AdminNav>` (client) as a fixed bottom bar + a content wrapper with bottom padding (`pb-20`) so content clears the bar.
- Tabs (icon + label): **Workers** `/admin` · **Shifts** `/admin/shifts` · **Places** `/admin/places` · **Attendance** `/admin/attendance` · **Payroll** `/admin/payroll`. Active tab (via `usePathname`, prefix match) highlighted.
- Existing ad-hoc header links on `/admin` are removed (nav now lives in the bar); the `+ Add worker` action stays on the Workers page header.
- Icons: small inline SVGs (no icon dependency).

## 4. Worker nav — `app/app/layout.tsx`
- Layout wrapping `/app/*` with `<WorkerNav>` bottom bar. Tabs: **Check-in** `/app/checkin` · **Hours** `/app` · **Profile** `/app/profile`.
- New page **`/app/profile`** — moves `TelegramConnect` + `LogoutButton` off the Hours page into Profile. `/app` keeps the entry form + worked-hours list ("Hours").
- Both layouts are server components; nav bars are client components for `usePathname`.

## 5. Worker filter dropdowns — `MultiSelectDropdown`
- New client component `packages/web/app/components/multi-select-dropdown.tsx`: a button labelled `<Label> (<n>)` (or just `<Label>` when empty) that toggles a panel of checkboxes; selecting toggles values via `onChange(string[])`. Closes on outside click / second tap. Mobile-friendly (full-width, tap targets ≥40px).
- `workers-filter.tsx`: replace each `Chips` group (city, gender, transportation, hebrew level, pay type, schedule, places) with a `MultiSelectDropdown`. `active` stays a single `<select>`; age stays two number inputs; Clear button stays. `WorkerFilters` + `filterWorkers` unchanged.

## 6. Testing
- web typecheck + build. `MultiSelectDropdown` selection logic is simple; the heavy filter logic (`filterWorkers`) is already unit-tested. No new pure logic warranting a unit test beyond a small `toggleValue` helper if extracted.

## 7. Out of scope
- Shifts redesign (Part B). Visual theming/branding beyond functional mobile layout.
