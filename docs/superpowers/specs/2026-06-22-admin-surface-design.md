# FlowCat Admin Surface — Design Spec

**Date:** 2026-06-22
**Status:** Approved design — ready for implementation plan
**Project:** `flow-cat` (repo `OneStromberg/flow-cat`, deployed on Vercel)

## 1. Purpose

Give the company owner an **admin area**: a worker flagged as admin logs in (same
phone + teudat zeut) and lands on `/admin`, where they can **add new workers**
(rich profile) and **browse all workers with complex multi-field filtering**. The
Google Sheet stays the database. Functional-first styling (the polished FlowCat
look is still a later plan).

## 2. Key Decisions (locked)

| Decision | Choice |
|---|---|
| Admin identity | An **`admin` column** on the Workers tab (`yes`/blank). No separate login. |
| Landing | After login, `/` routes by role: admin → `/admin`, worker → `/app`. |
| Admin scope (v1) | **Add worker** + **worker list with filtering**. No edit/delete of workers in the UI (done in the sheet for now). |
| Admin granting | The `admin` flag is set **only by editing the sheet**, not via the form. |
| Styling | Functional-first clean Tailwind. |
| Filtering | **AND across fields, OR (multi-select) within each enum**, age min–max, name/phone search, places + active — all **instant in-browser**. |

## 3. Architecture & Routes

```
/                         routes by role: requireWorker → worker.admin ? redirect /admin : redirect /app
/admin                    Workers list + filter panel   (variant 2.2)  [requireAdmin]
/admin/add                Add-worker form               (variant 2.1)  [requireAdmin]
API:
  POST /api/admin/workers create a worker (admin-only)   [requireAdmin]
```

### `requireAdmin()` (web `lib/session.ts`)
Like `requireWorker()` but also requires `worker.admin === true`. Returns the admin
`Worker` or null. Used by every `/admin*` page (→ redirect non-admins) and the
create route (→ 401/403). The login client redirects to `/`; the `/` page does the
role routing (so login itself doesn't need to know the role).

## 4. Data Model — Workers tab gains columns

Existing Workers columns stay: `phone · name · greeting · places · active · token · teudat_zeut`. New columns (header-driven append, so order in the sheet is flexible):

| Column | Canonical values |
|---|---|
| `admin` | `yes` / blank |
| `city` | free text |
| `transportation` | `nothing` / `car` / `electric_bicycle` |
| `age` | number (string in the cell) |
| `hebrew_level` | `read_write` / `speaks_good` / `mid` / `badly` / `none` |
| `pay_type` | `full` / `amount` / `none` |
| `pay_amount` | number (only meaningful when `pay_type = amount`) |
| `schedule` | `days` / `nights` / `all` |

**Enum option lists** live in `worklog-core` (`{ value, label }[]` for transportation,
hebrew_level, pay_type, schedule) so the add form, validation, and filters all agree
on the canonical strings + human labels.

`Worker` gains: `admin: boolean`, `city: string`, `transportation: string`,
`age: string`, `hebrewLevel: string`, `payType: string`, `payAmount: string`,
`schedule: string` (all parsed from the columns, defaulting to `''`/`false`).

## 5. Add Worker (`/admin/add` + `POST /api/admin/workers`)

- The page is a server component guarded by `requireAdmin` (redirect non-admins to
  `/`). It renders the client form: text inputs (phone, teudat zeut, name, city,
  age), enum `<select>`s (transportation, hebrew_level, pay_type, schedule), a
  **places multi-select** built from the active master `Places` list, and a
  **pay_amount input shown only when `pay_type = amount`**.
- `POST /api/admin/workers` is admin-guarded → calls **`addWorker(gateway, input)`**
  in `worklog-core`:
  - **Validates:** `phone`, `teudatZeut`, `name` required; `age` numeric if provided;
    `payAmount` required and numeric **iff** `payType = amount`; `transportation`,
    `hebrewLevel`, `payType`, `schedule` must be one of the canonical values;
    **duplicate phone rejected** (normalized phone already in Workers).
  - **Writes:** appends a header-aligned Workers row with `active=yes`, blank `admin`,
    blank `token`, the identity + profile fields. (Header-driven: missing columns are
    added once, like `appendWorkLog`.)
  - Returns `{ ok: true }` or `{ ok: false, errors: Record<string,string> }`.
- Success → client returns to `/admin` (the new worker appears in the list).

## 6. Worker List + Filtering (`/admin`)

- Server page (requireAdmin) loads **all** workers via **`listWorkers(gateway)`** and
  passes them + the enum option lists + active master places to a client component.
- **Pure `filterWorkers(workers, filters): Worker[]`** (in `web/lib`, unit-tested):
  - `search`: case-insensitive substring over name + normalized phone.
  - `cities`/`transportation`/`hebrewLevel`/`payType`/`schedule`/`places`: multi-select
    sets; a worker matches a field if its value ∈ the selected set (empty set = no
    constraint). **OR within a field, AND across fields.** (`places` matches if ANY of
    the worker's places is in the selected set.)
  - `active`: `'all' | 'yes' | 'no'`.
  - `ageMin`/`ageMax`: numeric range over `age` (workers with non-numeric/blank age
    are excluded only when a bound is set).
- The table lists each worker's key fields with a live "**N of M shown**" count and a
  link to `/admin/add`.

## 7. Security & Error Handling

- `requireAdmin` on every `/admin*` page and the create route: a non-admin or
  logged-out user is redirected (pages) or gets 401/403 (API) — they cannot reach
  admin screens or create workers.
- Add-worker validation errors render inline per field; duplicate phone → a clear
  message; Sheets failure → "couldn't save, try again" (logged server-side).
- Teudat zeut: admins type new workers' teudat into the form; it's written to the
  sheet but **never logged or echoed back** beyond the form round-trip.
- `runtime='nodejs'` on admin pages/routes (googleapis).

## 8. Testing

- **worklog-core:** `Worker` parses the new fields (incl. `admin` boolean);
  `listWorkers` returns all rows as `Worker[]`; `addWorker` — each validation case
  (missing required, bad enum, age non-numeric, `amount` without `pay_amount`,
  duplicate phone) + a success that appends the aligned row; the enum option lists.
- **web:** `filterWorkers` — the AND/OR/range/search matrix (the heart of the
  feature); `requireAdmin` returns null for a non-admin worker; the create route
  (admin-only → 401 for non-admin; validation errors → 400; success → 200).

## 9. Out of Scope (this build) / Future

- Editing or deleting a worker from the admin UI (sheet-only for now).
- The polished FlowCat visual + Russian localization; multi-shift features.
- Admin reporting / exports; per-worker pay calculations.
- Granting admin via the form (sheet-only).
