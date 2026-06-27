# UX Part B — Shifts Redesign — Design Spec

**Date:** 2026-06-27
**Status:** Approved — ready for plan
**Project:** `flow-cat`. Mobile-first. Builds on the Phase 1b shift model.

## 1. Purpose
Split the monolithic 400-line `/admin/shifts` page into focused pages, add a
week-based instance view, per-instance + template-level editing, and copy-a-
template-to-a-new-period. Mobile-first.

## 2. Decisions (locked)
- **Week view = horizontal 7-column grid** (scrollable on mobile) of shift *instances*, with prev/next week nav.
- **Edit = both** template-level (regenerates future instances) and per-instance override.
- **Copy to period** = duplicate the template (same days/times/headcount/location, new valid-from/to) carrying its recurring assignments, then generate instances.

## 3. Pages
- **`/admin/shifts`** — week grid. Header `‹ week of <Mon DD> ›` (prev/next week; `?week=YYYY-MM-DD`). 7 day-columns (Sun–Sat) in a horizontally-scrollable row; each column lists that day's instances: `start–end · location · assigned/headcount` with a ⚠ when `assigned < headcount` and not cancelled; cancelled instances shown struck-through. Tap an instance → `/admin/shifts/instances/[id]`. Buttons: **+ New shift** → `/admin/shifts/new`, **Templates** → `/admin/shifts/templates`.
- **`/admin/shifts/new`** — the add-template form only (moved out of the old page).
- **`/admin/shifts/templates`** — list of all templates (location · label · days · time · headcount · active) each linking to its detail.
- **`/admin/shifts/templates/[id]`** — template detail: **edit form** (weekdays/times/headcount/rate/valid-from/to → on save updates the template AND future instances), **recurring-assignment editor** (add/remove employees), **Copy to period** (new from/to + carry-assignments checkbox), and an upcoming-instances list.
- **`/admin/shifts/instances/[id]`** — single-instance editor: change date/start/end/headcount (override), **Cancel** (status=cancelled), and view/manage that instance's assignments (manual add/remove using existing `assignManual`/`removeAssignment`).

## 4. Data layer (worklog-core, unit-tested)
- `updateInstance(gateway, id, fields: { date?; start?; end?; headcount? }): Promise<{ok:true}|{ok:false;error}>` — overrides one instance row (validates times/headcount; 1-based updateRow).
- `applyTemplateEdit(gateway, templateId, today): Promise<{updated:number; created:number}>` — after a template is edited, update each **future** (`date ≥ today`, `status='scheduled'`) instance's `start/end/headcount/location` to match the template, and create newly-valid dates within the existing horizon (reuse generate logic). Past/cancelled instances untouched. Assignments preserved.
- `copyTemplate(gateway, templateId, opts: { validFrom; validTo; carryAssignments: boolean }): Promise<{ok:true;id}|{ok:false;errors}>` — reads the source template, `addTemplate` with copied fields + new validity, optionally copies active recurring assignments (`addRecurring` for each), returns the new id. (Caller then runs `generateInstances`.)
- `updateTemplate` already exists; the template-edit route calls it then `applyTemplateEdit`.

## 5. Routes
- `POST /api/admin/shifts` (exists) — add template; keep.
- `POST /api/admin/shifts/[id]` — edit template → `updateTemplate` + `applyTemplateEdit` + `generateInstances`. (Or a single `action` route — match existing patterns.)
- `POST /api/admin/shift-instances/[id]` — `updateInstance` / cancel / per-instance assign-remove.
- `POST /api/admin/shifts/copy` — `copyTemplate` + `generateInstances`.
- `POST /api/admin/shift-assignments` (exists) — recurring add/remove; keep.
- All `requireAdmin`. On-demand `generateInstances` calls are **awaited** here (not fire-and-forget) so the admin sees an error if seeding fails — closes the silent-failure gap seen in testing.

## 6. Perf (post-quota-fix)
- The week grid loads `listInstances({from:weekStart,to:weekEnd})` + the full `ShiftAssignments` once, and computes per-instance assigned counts **in memory** — no per-instance reads. Template detail similarly batches.

## 7. Testing
- **worklog-core:** `updateInstance` (override + validation + 1-based row), `applyTemplateEdit` (future updated, past/cancelled untouched, new dates created), `copyTemplate` (fields copied, new validity, assignments carried, new id).
- **web:** typecheck + build.

## 8. Out of scope
- Drag-to-reschedule (Phase 5 flexible-scheduling). Rotating patterns. Worker-facing shift calendar (separate later).
