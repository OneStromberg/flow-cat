# Phase 1a — Employee & Location Field Extensions — Design Spec

**Date:** 2026-06-24
**Status:** Approved design — ready for implementation plan
**Project:** `flow-cat` (Attendance+Payroll, built on the FlowCat POC). See `docs/prd-discovery.md`.

## 1. Purpose

Extend the two existing Google-Sheets tabs (`Workers`, `Places`) with the
attributes the scheduling/payroll system needs, so later phases (shifts,
assignment, check-in, payroll, dashboard) have fields to reference. Purely
additive, header-driven column extensions — the same mechanical pattern used by
Add Place. No new tables, no behavioral subsystems here.

## 2. Key Decisions (locked)

| Decision | Choice |
|---|---|
| Employee soft-delete | **Reuse the existing `active` column.** `active=no` = soft-deleted/terminated: hidden from default admin lists, kept for reports, never hard-deleted. A richer `status` enum is deferred until "suspended vs terminated" is actually needed. |
| Gender values | `male` / `female` / `other` / blank (localized labels later). |
| Required headcount | **Not** a location field — it belongs to the shift (Phase 1b). |
| Row-level access | Enforced when worker-facing views are built (later phases). 1a keeps editing admin-only and just adds columns. |
| Storage | Google Sheets only (per 0A). Header-driven append: new columns are added once, existing rows pad ragged. |

## 3. Employees — `Workers` tab

**New column:** `gender` (`male` / `female` / `other` / `''`).

- `worklog-core`: add a `GENDER` enum option list in `worker-fields.ts`
  (`{value,label}[]`, mirroring `TRANSPORTATION` etc.); `Worker` gains
  `gender: string`; `parseWorker` reads it; `WORKERS_COLUMNS` (in `add-worker.ts`)
  gains `gender`; `addWorker` validates `gender` is in the enum (blank allowed)
  and writes it.
- **Soft-delete:** no code change to the column itself (already exists). Admin
  list default shows `active` workers; a **"show inactive"** toggle reveals
  `active=no` rows. (Soft-delete action — flipping `active` to `no` from the UI —
  is a later edit-worker feature; 1a only ensures lists/filer honor it.)
- **Filter:** `filterWorkers` gains a `gender` multi-select (OR within, AND across,
  same shape as the existing enum filters) and an `active` state already present.
- **Admin add-worker form** gains a `gender` `<select>`.

## 4. Locations — `Places` tab

**New columns:** `client`, `geofence_radius_m`, `contact`, `base_rate`,
`required_attributes`, `notes`.

| Column | Meaning | Type |
|---|---|---|
| `client` | Owning customer/company the site belongs to | free text |
| `geofence_radius_m` | Allowed check-in radius (Phase 2 uses it) | number, default `100` |
| `contact` | Site contact (name/phone), free text | free text |
| `base_rate` | Location base hourly rate in ILS (payroll uses it later) | number (string in cell) |
| `required_attributes` | Free tags an assignee should have, e.g. `car,male` (assignment warns on mismatch in 1b/§3) | comma-separated tags |
| `notes` | Freeform notes | free text |

- `worklog-core`: `Place` interface gains `client, geofenceRadiusM, contact,
  baseRate, requiredAttributes (string[]), notes`; `listPlaces` parses them
  (`geofence_radius_m` defaults to `100` when blank; `required_attributes`
  splits on comma, trims, drops empties); `AddPlaceInput` + `addPlace` +
  `PLACES_COLUMNS` gain the new fields (all optional except the existing
  name+coords; numeric fields validated as numeric when present).
- **Add-place form** (`/admin/places/add`): after the autocomplete selection,
  show optional inputs for `client`, `contact`, `base_rate`, `geofence_radius_m`
  (pre-filled `100`), `required_attributes`, `notes`. Autocomplete still supplies
  name/coords/place_id/address.
- **Places list** (`/admin/places`): add a `client` column; keep Waze/Maps links.

## 5. Validation & Security

- Admin-guarded everywhere (`requireAdmin`), same as existing worker/place routes.
- Numeric fields (`geofence_radius_m`, `base_rate`) validated numeric when
  non-blank; blank allowed (defaults applied for radius).
- `gender` must be in the enum or blank.
- No new PII beyond what's already handled; everything stays in Sheets.

## 6. Testing

- **worklog-core:** `parseWorker`/`addWorker` with `gender` (valid, blank, invalid →
  rejected); `filterWorkers` gender multi-select matrix; `listPlaces`/`addPlace`
  for all new location fields incl. `geofence_radius_m` default-100 and
  `required_attributes` comma-split; numeric validation for radius/rate.
- **web:** typecheck + build (no route-test harness, per repo convention).

## 7. Out of Scope (this spec)

- Shift templates/instances, assignments (Phase 1b).
- Editing/soft-deleting a worker from the UI (later edit-worker feature);
  1a only makes lists/filters honor `active`.
- Payroll computation using `base_rate` (Phase 2).
- Geofence enforcement using `geofence_radius_m` (Phase 2 check-in).
- Row-level worker self-view access (later phases).
- i18n of the new labels (handled in the cross-cutting i18n pass).
