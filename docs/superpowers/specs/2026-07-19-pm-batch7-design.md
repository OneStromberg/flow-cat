# PM Feedback Batch 7 — Design

**Date:** 2026-07-19
**Context:** Second batch **post-Firestore** and directly after **batch 6** (which shipped: i18n RU/EN/HE worker toggle, collapsible shift details with Waze, cascade place-delete via `cascadeDeletePlace`, per-assignment rates, map worker names, checkout geofence hard-block, exceljs multi-sheet reports `report_by_object`/`report_by_person`/`report_summary`, birthdate/age). This is **batch 7**: 14 items across Workers, Shifts, Places, Attendance, Reports, Managing roles (a NEW manager role), and Alarms (a family of missed-checkout bugs). The **controller has already root-caused every bug** in this list — the roots below are verified against the code, not re-derived.

Spec only — no plan, no code. Each item gives the fix/approach, the exact files, the design decision(s) I'm making, and open questions for the PM. YAGNI/ponytail flagged where the ask risks over-building.

Storage note: everything still lands behind the `SheetsGateway` row/tab interface (Firestore-backed). New columns append non-destructively via the existing `ensureHeader`/`WORKERS_COLUMNS`-merge pattern — no forced migration for any schema add below.

---

## Area 1 — Workers

### W1 — Worker-filter city dropdown is short (bug)
**Root confirmed:** `admin/page.tsx:22` builds `const cities = [...new Set(workers.map((w) => w.city ?? '').filter(Boolean))].sort();` — the option source is **only cities that existing workers already carry**, not the curated list. It is passed as the `cities` prop to `WorkersFilter`, which renders `cityOpts = cities.map((c) => ({ value: c, label: c }))` (`workers-filter.tsx:25`) into the City `MultiSelectDropdown` (L39). Meanwhile the embedded **27-city `CITIES`** constant (`worker-fields.ts:35–63`, `value` = Hebrew canonical, `label` = "Русский — עברית") is what the *forms* use. So the filter can only offer cities already in use, exactly as the PM saw.
**Approach:** Source the filter's city options from `CITIES` (the same list the forms use).
- Import `CITIES` in `admin/page.tsx`, drop the `workers.map` derivation, and pass `CITIES` (or `CITIES.map(c => ({value, label}))`) into `WorkersFilter`.
- `workers-filter.tsx`: accept the richer `{value,label}[]` for cities so the bilingual label shows, and drop the local `cityOpts` re-wrap (or change its `cities` prop type from `string[]` to the option shape). Filtering still matches on `worker.city` (Hebrew canonical `value`), which is unchanged — `filterWorkers` compares the selected `value`s to `w.city`.
**Files:** `packages/web/app/admin/page.tsx` (L22, and the `<WorkersFilter cities=…>` prop at L37), `packages/web/app/admin/workers-filter.tsx` (L13 prop type, L25 `cityOpts`, L39 City dropdown).
**Decision:** `CITIES` becomes the filter's option source, matching the forms — single source of truth. Keep the value=Hebrew so existing worker `city` data still matches. Ponytail: do NOT union CITIES with in-use cities "just in case" — if a legacy worker has an off-list city it simply won't be a filter chip (rare; not worth the merge complexity). Flag if the PM wants that union.
**Open Q:** none — `CITIES` is the confirmed list (batch-6 W3 already settled it as authoritative).

---

## Area 2 — Shifts

Data layer: `packages/worklog-core/src/data/{shift-templates,shift-instances,shift-assignments,places}.ts`. Note: the "new shift" surface (`admin/shifts/new/`) is a **template** creator (`add-template-form.tsx` → `POST /api/admin/shifts` → `addTemplate` + `generateInstances`). Per-instance editing/assignment lives in `admin/shifts/instances/[id]/instance-detail.tsx`.

### S1 — Optional inline worker assignment on shift/template creation (feature)
**Root confirmed:** `add-template-form.tsx` has no worker field; `POST /api/admin/shifts` (`api/admin/shifts/route.ts`) calls `addTemplate` then `generateInstances`. The recurring-assignment primitive `addRecurring(gateway, templateId, phone)` already exists (`shift-templates.ts:2`, used by `copyTemplate`) and `generateInstances`/`seedTemplateInstances` seed active recurring assignments into instances. `assignManual` exists for a single instance.
**Approach:** Add an **optional** worker picker to the create form; on submit, after the template is created, seed the assignment as a **recurring** assignment (so it flows into all generated instances), reusing `addRecurring`.
- `add-template-form.tsx`: add an optional `<select>` (workers list, blank = "no one yet"), send `assignPhone` in the POST body.
- `api/admin/shifts/route.ts`: after `addTemplate` succeeds and before/after `generateInstances`, if `assignPhone` is present call `await addRecurring(gw, r.id, normalizePhone(assignPhone))`. Then `generateInstances` seeds it into the freshly created instances. Wrap in the existing try/catch → surface as `seedWarning`, never a false save-failure (batch-5 Fix A pattern).
- The create form needs the workers list — thread it from `admin/shifts/new/page.tsx` (add a `listWorkers` load, pass `workers` prop alongside `places`).
**Files:** `packages/web/app/admin/shifts/new/page.tsx` (load + pass workers), `packages/web/app/admin/shifts/new/add-template-form.tsx` (optional picker + payload), `packages/web/app/api/admin/shifts/route.ts` (seed via `addRecurring`).
**Decision:** recurring assignment (not per-instance `assignManual`) is the right primitive here — a template is recurring, so the assignee should carry to every generated instance, matching how staffing already works. Single optional assignee (not multi) — headcount>1 staffing is still done per-instance in `instance-detail`. Ponytail: do NOT build a full multi-worker roster into the create form; one optional "assign now" is the ask.
**Open Q:** If the template's headcount is >1, is a single inline assignee enough at creation (rest added per-instance later)? I assume yes.

### S2 — Render the Google Maps link in worker shift details (feature, small)
**Root confirmed:** `checkin/page.tsx:31,74` already threads `mapsUrl: googleMapsUrl(place.lat, place.lng, place.placeId)` into each `InstanceWithAttendance`. But `checkin-client.tsx:128` only destructures `wazeUrl: navUrl` and renders a single "navigate" link (L161) — `mapsUrl` is dropped on the floor. (batch-6 Task 16 threaded it; only Waze got rendered.)
**Approach:** In `checkin-client.tsx`, also destructure `mapsUrl` and render a second link inside the `<details>` block next to the Waze one (e.g. "Waze" + "Google Maps", both `target="_blank"`). Add a `checkin.navigateMaps`/reuse a maps key in the i18n dict.
**Files:** `packages/web/app/app/checkin/checkin-client.tsx` (L128 destructure, L161 the details link block).
**Decision:** two explicit labelled links (Waze / Google Maps) rather than one generic "Navigate" — the data is already present, this is pure render. Add the one dictionary key.
**Open Q:** none.

### S3 — Per-template "selfie required at start / at end" flags (feature)
**PM-confirmed design:** a shift **TEMPLATE** carries two independent flags — **selfie required at start** and **selfie required at end**. On the worker's check-in/out: if a selfie is required for that leg, the Начать/Завершить button **opens the camera** and the photo submits **with** the check-in/out (one action); if not required, there is **no photo step at all**. This replaces today's always-present optional photo input.
**Root confirmed:**
- Template schema: `ShiftTemplate`/`AddTemplateInput` + `TEMPLATE_COLUMNS` (`shift-templates.ts:8–19`), parsed in `parseTemplate` (L37), written in `recordOf` (L102). No selfie fields today.
- Worker view: `checkin-client.tsx:110–125` renders one always-optional `<input type="file" capture="user">`; `handleAction` sends `photo: photoDataUrl` for BOTH legs. `checkin/page.tsx` builds `items` from the template (`tpl`) — so per-shift flags can be threaded the same way `role`/`instructions` already are.
- Server: `api/checkin/route.ts` already accepts `photo` (L51) and stores it (`storeCheckinPhoto`, L106). It loads the instance + place but **not** the template — so a server-side "photo required" guard needs the template loaded.
**Approach:**
- **Schema:** add `selfie_start` + `selfie_end` to `TEMPLATE_COLUMNS`; add `selfieStart: boolean`/`selfieEnd: boolean` to `ShiftTemplate` (and string inputs to `AddTemplateInput`), parse (`'yes'`) in `parseTemplate`, write in `recordOf`. Template create/edit forms (`add-template-form.tsx`, and the edit form) get two checkboxes; `POST /api/admin/shifts` + the update route thread them through.
- **Thread flags to the worker view:** `checkin/page.tsx` adds `selfieStart`/`selfieEnd` to `InstanceWithAttendance` from `tpl`. `checkin-client.tsx` decides per shift+leg whether a selfie is required (start leg uses `selfieStart`, end leg uses `selfieEnd`).
- **Capture flow:** remove the standalone always-on photo input. Instead, when the action button is pressed for a leg that **requires** a selfie, trigger a hidden `<input type="file" accept="image/*" capture="user">` (`.click()`); the file's data-URL becomes the `photo` submitted with that same check-in/out call (one action, per the PM). When the leg does **not** require a selfie, submit immediately with no photo.
- **Server-side guard:** `api/checkin/route.ts` loads the template for the instance (`listTemplates` + find by `instance.templateId`), and if the required leg's flag is set but `photo` is absent/empty, reject (422, e.g. `selfie_required`) — a real guard, not just client-side.
**Files:** `packages/worklog-core/src/data/shift-templates.ts` (columns + type + parse + record), `packages/web/app/admin/shifts/new/add-template-form.tsx` + the template **edit** form + `api/admin/shifts/route.ts` + the template update route (flags), `packages/web/app/app/checkin/page.tsx` (thread flags per shift), `packages/web/app/app/checkin/checkin-client.tsx` (capture-on-demand flow), `packages/web/app/api/checkin/route.ts` (server-side require-photo guard).
**Decision:** flags live on the **template** (not the instance), so they apply to every generated instance — matches how role/instructions/rate already work. The camera opens **per required leg** (start selfie independent of end selfie). One-action capture (photo rides the check-in/out call) — no separate upload step. Ponytail: do NOT add a photo *preview/confirm* modal — the PM wants one tap → camera → submit.
**Open Q:** If GPS/camera is denied on a required-selfie leg, is the worker **hard-blocked** from checking in (no selfie = no check-in), or is there an escape hatch? I lean hard-block (mirrors the geofence block), but confirm — this can strand a worker whose camera fails.

### S4 — Compress check-in photos + auto-delete + admin per-object export (feature)
**PM-confirmed:** (a) **compress** check-in photos to low quality on upload (small files); (b) **auto-delete after ~45 days** via a **GCS bucket lifecycle rule** (infra, the controller applies it — spec it as a note, not a build task); (c) an admin **export per object**: download a zip of that object's photos, each named with **date+time**.
**Root confirmed:** upload path `checkin-client.tsx` → data-URL → `POST /api/checkin` → `storeCheckinPhoto(dataUrl, key, which)` (`lib/gcs.ts:29`) saves to `checkins/<instanceId>_<phone>-<in|out>.jpg` in `CHECKIN_PHOTOS_BUCKET`. The object name has **no timestamp**; the attendance row stores the object name in `check_in_photo`/`check_out_photo` and the timestamp in `check_in_at`/`check_out_at`. `signedReadUrl` (L54) already reads back. There are **no list/zip helpers** and no export route today.
**Approach:**
- **Compression (client):** in the S3 capture flow, downscale + JPEG-compress the captured image via a `<canvas>` (e.g. cap longest edge ~1280px, `toDataURL('image/jpeg', ~0.5)`) before putting it in `photo`. Pure, testable helper (`compressImage(dataUrl, opts)`). Smaller payload → smaller GCS object → cheaper.
- **Auto-delete (infra NOTE, not a code task):** a GCS **lifecycle rule** deleting objects under the check-in bucket older than ~45 days. **The controller applies this via `gcloud` (project `story-teller-app-01`, account `onestromberg@gmail.com`).** No app code. (Flag: a lifecycle rule is bucket-wide by prefix `checkins/`; confirm 45 days and that nothing else lives in that bucket.)
- **Per-object export (new route + helpers):** because GCS object names don't encode the place or a timestamp, the export must **join through attendance**: given a place (and optional date range), find its instances (`listInstances` filtered by `location`), collect attendance rows for those instances, and for each row with a `check_in_photo`/`check_out_photo` object name, download the object and add it to a zip named from that row's `check_in_at`/`check_out_at` (formatted date+time in `COMPANY_TZ`, plus worker name + in/out to disambiguate). Stream the zip as a download.
  - `lib/gcs.ts`: add `downloadPhoto(objectName): Buffer|null` and a small zip assembly (a zip lib — see open Q) OR keep zip assembly in the route and gcs.ts only exposes download. Pure `photoZipEntryName(date, time, worker, which)` helper is unit-tested.
  - New `app/api/admin/photos/export/route.ts` (admin-only, `requireAdmin`): params `{ place, from?, to? }` → streams `application/zip`, `Content-Disposition: attachment`.
  - **UI trigger:** an "Export photos" button. Placement — the **place detail page** (`admin/places/[name]/page.tsx`) is the natural "per object" home; the attendance page is the alternative. (See open Q.)
- **MCP note (portal repo has a BLOCKING MCP rule; FlowCat does not have an MCP surface — n/a here.)**
**Files:** `packages/web/lib/gcs.ts` (download + list/zip helpers), `packages/web/app/app/checkin/checkin-client.tsx` (canvas compression in the capture flow), new `packages/web/app/api/admin/photos/export/route.ts`, a UI trigger in `packages/web/app/admin/places/[name]/page.tsx` (or attendance). GCS lifecycle = **controller gcloud step, not code**.
**Decision:** attendance-join (not raw GCS listing) is the export's backbone — it's the only place the object↔place↔timestamp mapping exists. Compression client-side (canvas) keeps the server dumb. Ponytail: do NOT build a photo gallery/lightbox admin UI — the ask is a zip download.
**Open Q (roundup):** (1) export UI location — place detail page vs attendance page? (2) zip library choice — add a small dep (`jszip`/`archiver`) or hand-roll a store-only zip? (3) confirm 45-day lifecycle + that `checkins/` is the whole bucket's story.

---

## Area 3 — Places

### P1 — Deleted place (Gedera) still shows on the map (bug)
**Root confirmed:** `admin/map/page.tsx:49` does `for (const place of places)` where `places = await listPlaces(gw)` (L27) — `listPlaces` returns **all** places including `active===false` (it only filters blank names, `places.ts:60–61`). The loop filters cancelled *instances* (L55) but never checks `place.active`, so a soft-deleted place with a lingering (or zero) instance still renders a marker. Contrast the admin **Places list** (`places/page.tsx:15`) and admin **Workers page** (`loadActivePlaces`), which do filter active.
**Approach:** Only render active places. Add `if (!place.active) continue;` at the top of the loop, or filter `places.filter((p) => p.active)` before iterating. `Place.active` is already a parsed boolean (`places.ts:64`).
**Files:** `packages/web/app/admin/map/page.tsx` (L49 loop / L27 load).
**Decision:** filter on `place.active` (cheapest, uses the existing boolean). Keep the existing per-instance `status !== 'cancelled'` filter (L55) — both are needed. Gedera was already cascade-soft-deleted in batch-6 (`cascadeDeletePlace`), so this filter is the last consumer that ignored `active`.
**Open Q:** none.

### P2 — Reframe `baseRate` as the admin-only "Billing rate" (feature)
**Root confirmed:** `Place.baseRate` (`places.ts:26`, column `base_rate`) is edited in `add-place-form.tsx` + `edit-place-form.tsx:136` (labelled "Base rate"), validated in `addPlace`/`updatePlace`, and consumed by the reports **summary** (`reports.ts:167` via `rateByLocation`) and payroll fallback (`resolveAssignmentRate` last tier). The places **list** page doesn't show it; the place **detail** page may. It is currently visible/editable to anyone with `requireAdmin` — there is no manager role yet (see MR1).
**Approach:** Relabel to **"Billing rate"** and make it **admin-only** (invisible + non-editable to managers).
- Relabel the field in `add-place-form.tsx`, `edit-place-form.tsx:136`, and any place-detail display. Copy note: it's the **revenue** rate (rate × hours = income from that object), sitting alongside payroll cost in reports.
- Gate visibility/edit on the **admin** role (not manager) — depends on MR1's role mechanism. In the forms (client), receive an `isAdmin` prop from the server page (`requireManagerOrAdmin` gives the surface; `worker.admin === true` decides whether the Billing-rate field renders). On the **write** side, `updatePlace`/`addPlace` must ignore/reject a `baseRate` change from a non-admin (manager) — the route enforces `requireAdmin` for that field, not just the UI.
- Reports already read `baseRate` (summary revenue) — unchanged; the Reports page itself is admin-only under MR1, so a manager never sees the revenue number anyway.
**Files:** `packages/web/app/admin/places/add/add-place-form.tsx`, `packages/web/app/admin/places/[name]/edit/edit-place-form.tsx` (L136 label + conditional render), the place detail page (`admin/places/[name]/page.tsx`), the places API route (`api/admin/places/route.ts` — server-side admin gate on `baseRate`), and MR1's role plumbing.
**Decision:** "Billing rate", admin-only, gated **both** in UI (hide) and server (reject a manager's write of the field). Do NOT split `baseRate` into a new column — same field, new label + gate. This is coupled to MR1; ship them together.
**Open Q:** Should a manager see the Billing-rate field **read-only** (greyed) or be **entirely hidden**? PM said "not visible/editable" → I lean fully hidden.

---

## Area 4 — Attendance

### A1 — Manual entry/correction of shift start & end time, not just hours (feature)
**Root confirmed:** the data layer already supports it — `adminCorrect(gw, id, { checkInAt?, checkOutAt?, hours? })` (`attendance.ts:238`) writes `check_in_at`/`check_out_at` and recomputes hours when both are present (unless an explicit `hours` override is given). The route `api/admin/attendance/route.ts:20–22` **already parses and forwards** `checkInAt`/`checkOutAt`. The gap is purely UI: `attendance-client.tsx` only renders an **hours** `<input>` (L92) and only sends `{ attendanceId, hours }` (L38). Check-in/out are display-only (`hhmm`, L88–89).
**Approach:** Add editable start/end **time** inputs to the correction UI.
- `attendance-client.tsx`: make the Check-in / Check-out cells editable (a `datetime-local` or a time input paired with the row's date), track edits in state alongside `editedHours`, and POST `checkInAt`/`checkOutAt` (as ISO) when changed. When start/end are edited and hours is left untouched, send only the timestamps → `adminCorrect` recomputes hours; when hours is explicitly edited, it wins (existing precedence).
- The route needs **no change** (already forwards both) — confirm and add a test.
- TZ care: the table shows time in `Asia/Jerusalem` (`hhmm`); the editor must convert the local wall-clock the admin types back to a UTC ISO before sending (reuse the company-TZ conversion, mirroring `localWallClockToUTC`). This is the one subtlety — a naive `new Date(local).toISOString()` would be off by the offset.
**Files:** `packages/web/app/admin/attendance/attendance-client.tsx` (editable time cells + payload), `packages/web/app/api/admin/attendance/route.ts` (confirm forwarding; add coverage). Possibly a small client TZ helper.
**Decision:** expose `checkInAt`/`checkOutAt` editing (the "left without checking out" case), leaving the explicit-hours override intact as the top precedence. `datetime-local` bound to the row date is the simplest correct control. Ponytail: no bulk/multi-row edit — per-row inline, matching today.
**Open Q:** Edit as **date+time** (`datetime-local`) or **time-only** (reusing the row's date)? Time-only is simpler but can't fix an overnight checkout that landed on the wrong calendar date — I lean `datetime-local`.

---

## Area 5 — Reports

### R1 — Reports show no headers / a number instead of a name (bug)
**Root confirmed (controller generated a real report):** the builders + exceljs assembly are **structurally correct** — `workbookResponse` (`api/admin/reports/route.ts:39`) writes a title row + header row + data rows per sheet, and Hebrew names render fine. The real defect is **phone normalization mismatch across the join**:
- Attendance rows store `employee_phone` **as written at check-in time**, un-normalized in some rows (e.g. `0506918673`); `toAttendance` only trims it (`attendance.ts:72`). Worker phones are **normalized** (`parseWorker` → `normalizePhone`, e.g. `972506918673`).
- `reportByObject`/`reportByPerson` join names via `nameByPhone.get(a.employeePhone)` (`reports.ts:105,139`) where `nameByPhone` is keyed by the **normalized** worker phone (route L102). Mismatch → `.get` misses → the raw phone number is shown instead of the name ("name shows as a number").
- `filterAttendanceForReport` (`reports.ts:70`) filters `a.employeePhone` against the selected `employeePhones` (normalized, from the client's worker picker). Un-normalized attendance rows fail the match → dropped → "no info" when an employee filter is applied.
**Approach:** Normalize phones on **both sides** of the join and the filter.
- In `reportByObject`/`reportByPerson` (and anywhere a report keys off `a.employeePhone`), look up via `nameByPhone.get(normalizePhone(a.employeePhone))`.
- In `filterAttendanceForReport`, compare `normalizePhone(a.employeePhone)` against `employeePhone` values also passed through `normalizePhone` (normalize the filter set once).
- Import `normalizePhone` from `worklog-core/phone.ts` (already exported).
- **One-time data repair (controller runs it):** a helper that rewrites existing `Attendance.employee_phone` (and any un-normalized `ShiftAssignments.employee_phone`) to normalized form, so future joins/filters are clean without the per-read normalize. Idempotent. This is the durable fix; the in-join normalize is the immediate/defensive one. (Do both — the repair fixes history, the normalize protects against any future un-normalized write, e.g. an old client.)
- **Layout vs the PM's example:** the controller confirmed **headers ARE present** (title + header + rows all written). The PM's example workbook has slightly different **indentation/placement** (title/header offset). Decision needed: match the example's exact indentation, or leave as-is since the structure is correct. I lean **leave as-is** (headers/data are all there; the indentation is a manual-template cosmetic) unless the PM specifically wants the title/header row placement to mirror the sample cell-for-cell. (See open Q.)
**Files:** `packages/worklog-core/src/data/reports.ts` (normalize in the two builders' joins + in `filterAttendanceForReport`), possibly a `repairAttendancePhones(gateway)` helper in `worklog-core` (data repair). No route change beyond passing normalized filter values.
**Decision:** the fix is phone normalization on both sides of the join + filter, plus a one-time repair of stored phones. Keep the sheet layout as-is (structure is correct) pending the PM's call on cell-exact matching. Ponytail: do NOT re-architect the report builders — they're correct; this is a join-key bug.
**Open Q (roundup):** (1) match the PM's example indentation/placement cell-for-cell, or leave the (correct) current layout? (2) run the one-time attendance/assignment phone repair now (recommended) vs rely only on the per-read normalize?

---

## Area 6 — Managing roles

### MR1 — Add a "manager" role = full admin EXCEPT Payroll, Reports, and Place billing rate (feature)
**PM-confirmed:** a **manager** can do everything an admin can, EXCEPT: no **Payroll** page, no **Reports** page, no visibility/edit of a Place's **Billing rate** (P2). Everything else allowed.
**Root confirmed:** the only role signal today is `Worker.admin?: boolean` (`workers.ts:13`, column `admin`, parsed `=== 'yes'` at L44). `requireAdmin` (`session.ts:30`) gates on `worker.admin === true`. Payroll (`payroll/page.tsx`) and Reports (`reports/page.tsx:11`) pages both call `requireAdmin` and `redirect('/')` on fail; their API routes (`api/admin/reports/route.ts:64`, payroll's data path) also `requireAdmin`. The admin nav (`admin-nav.tsx:5`) is a static `TABS` array including Payroll + Reports, rendered by `admin/layout.tsx` (a server component that currently passes AdminNav no props). `WORKERS_COLUMNS` already has an `admin` column and the form writes `admin: input.admin ? 'yes' : ''`.
**Approach:** Introduce a manager tier and gate the three admin-only surfaces on **admin**, everything else on **manager-or-admin**.
- **Role mechanism (decision needed — see open Q):** simplest options —
  - **(a) `role` column** (`worker` | `manager` | `admin`) as the single source; derive `isAdmin`/`isManager` from it. Cleanest long-term; requires a small back-compat read (existing `admin='yes'` → `role='admin'`).
  - **(b) keep `admin` + add a `manager` boolean column.** Least migration; `admin` stays the super-flag, `manager` is additive. Slightly messier (two booleans, must define admin⇒manager).
  I **recommend (a) `role`**, with a read-time fallback: `role` if set, else `admin==='yes' ? 'admin' : 'worker'` — no back-fill needed, mirrors the batch-6 birthdate/age fallback pattern.
- **Session helpers:** add `requireManagerOrAdmin()` (allows role ∈ {manager, admin}) alongside the existing `requireAdmin()` (admin only). Add `role`/`isManager` to the `Worker` model.
- **Gate the surfaces:** Payroll + Reports pages **and their API routes** keep `requireAdmin` (admin-only). All other admin pages switch their guard to `requireManagerOrAdmin` so managers can use them. Place Billing-rate field gated on `admin` (P2).
- **Nav:** `admin/layout.tsx` (server) reads the worker's role and passes it to `AdminNav`; `admin-nav.tsx` hides the Payroll + Reports tabs for managers.
- **Worker form:** add role selection (`add-worker.ts` / the add + edit forms) — a `role` select (or manager checkbox) instead of / in addition to the admin flag.
**Files:** `packages/worklog-core/src/data/workers.ts` (role field + parse + fallback), `packages/worklog-core/src/data/add-worker.ts` (`WORKERS_COLUMNS` + write), `packages/web/lib/session.ts` (`requireManagerOrAdmin` + `requireAdmin` unchanged), the Payroll + Reports pages/routes (stay admin-only), all other `admin/*` page guards (→ manager-or-admin), `packages/web/app/admin/admin-nav.tsx` + `packages/web/app/admin/layout.tsx` (role-aware nav), the worker add/edit forms + the place forms (P2 gate).
**Decision:** recommend a single `role` column with an `admin`-boolean read fallback; `requireManagerOrAdmin` for shared surfaces, `requireAdmin` for Payroll/Reports/Billing-rate. Gate on the **server** (route guards), not just nav-hiding — a manager hitting `/admin/payroll` or `POST /api/admin/reports` directly must 401/redirect. Ponytail: do NOT build a general permissions/RBAC matrix — three carve-outs, one role field.
**Open Q (roundup):** role mechanism — a `role` column (recommended) vs `admin` + `manager` boolean pair?

### MR2 — Admins/managers (who are also workers) can self-assign and check in/out (feature)
**Root confirmed (investigated):**
- **Assignable list:** `instance-detail.tsx:86` `availableWorkers = workers.filter((w) => w.active && !assignedPhones.has(w.phone))` — it does **not** exclude admins. So an active admin **already appears** in the assign dropdown. Good — self-assignment is data-possible today.
- **Worker check-in reachability:** the root router `page.tsx` does `redirect(worker.admin ? '/admin' : '/app')` — an admin is **always** sent to `/admin` and there is **no nav link** from the admin surface to `/app/checkin`. `requireWorker()` (`session.ts:22`) returns the worker regardless of `admin`, and `checkin/page.tsx:36` only requires `worker.active` — so an admin who **manually** navigates to `/app/checkin` can use it, and the check-in route's authz (`api/checkin/route.ts:64`, "must have an active assignment") works for admins too. The gap is purely **navigation**: an admin has no way *to* the worker check-in screen.
**Approach:**
- **Self-assignment:** already works (admins are in `availableWorkers`). Add a test asserting an admin/manager appears and can be assigned. If the PM wants a one-tap "assign me" shortcut on the instance page, add a small button that assigns the current session worker — optional nicety.
- **Reach the check-in flow:** give admins/managers an entry point to `/app/checkin` — e.g. a link in the admin nav or the admin header ("My shifts"), and/or relax the root redirect so an admin can opt into the worker view. The pages themselves already permit it (`requireWorker` + active); no auth change needed, just a navigable link. Confirm the `/app` layout renders for an admin (it calls `requireWorker`, which returns the admin) — it does.
**Files:** `packages/web/app/admin/admin-nav.tsx` or `admin/layout.tsx` (a "My shifts / Check-in" link), optionally `packages/web/app/page.tsx` (root redirect nicety), optionally `instance-detail.tsx` (an "assign me" shortcut). No change needed to `api/checkin/route.ts` or `checkin/page.tsx` (already admin-compatible).
**Decision:** the feature is ~90% present — the only real gap is a navigation link to `/app/checkin` for admin/manager accounts. Add that link; keep the check-in authz as-is (assignment-gated). Ponytail: do NOT fork a separate admin-checkin UI — reuse `/app/checkin`.
**Open Q:** Do admins/managers want a dedicated "assign me to this shift" button, or is picking themselves from the existing dropdown enough? I lean the existing dropdown + a nav link is sufficient.

---

## Area 7 — Alarms (missed-checkout family)

Plumbing: detection in `worklog-core/missed-checkins.ts` (`findMissedCheckins`), dispatch in `api/cron/missed-checkins/route.ts`. `toE164` exists in `worklog-core/phone.ts`. `COMPANY_TZ` = `Asia/Jerusalem`.

### AL1 — Missed-checkout alarm on 15-min grace after scheduled end (feature/bug)
**Root confirmed:** the missed-**checkout** branch already exists — `findMissedCheckins` fires a `type:'out'` event when `now > inEnd + grace` and an **open** attendance record exists (`missed-checkins.ts:106–118`). But `grace` there is the **per-place** grace (`placeGraceMins(...) * 60000`, L89, default 10) applied to **both** legs. The PM wants the checkout grace fixed at **15 min** after scheduled end (local time).
**Approach:** Use a **fixed 15-min** grace for the checkout leg specifically (decouple from the place's check-in grace). Either pass a separate `checkoutGraceMins = 15` into `findMissedCheckins`, or hardcode a `CHECKOUT_GRACE_MS = 15*60000` for the `type:'out'` condition (`now > inEnd + CHECKOUT_GRACE_MS`). Keep the per-place grace for the check-**in** miss.
**Files:** `packages/worklog-core/src/data/missed-checkins.ts` (the `inEnd + grace` checkout condition, L107).
**Decision:** fixed 15-min checkout grace, independent of the per-place check-in grace. Ties into AL4's `endMs` review (same code block). Unit-test the boundary (14:59 vs 15:01 after end).
**Open Q:** none beyond AL4's timing review.

### AL2 / AL3 — One message per object; make the phone tappable (bug)
**Root confirmed:** `api/cron/missed-checkins/route.ts:37–47` maps ALL `due` events to `lines[]` and joins them into **one** `notifyAdmins(\`Missed checkins:\n${lines.join('\n')}\`)` — a single lumped message. And each line prints the phone **raw**: `📞 ${m.employeePhone}` (L41), not E.164, so it isn't tap-to-call.
**Approach:**
- **Group by location:** bucket `due` by `m.location` and send **one `notifyAdmins` per location** (each message headed by the object name, listing that location's missed events). Preserves the existing `recordAlerts(gw, due)` dedup (still recorded once for all).
- **Tappable phone:** print `toE164(m.employeePhone)` instead of the raw value — Telegram auto-links E.164 into tap-to-call (the batch-6 Bot2 decision; `toE164` already imported-able from `worklog-core`).
**Files:** `packages/web/app/api/cron/missed-checkins/route.ts` (grouping + `toE164` in the line builder).
**Decision:** one message per location; E.164 phones (no `parse_mode`/HTML needed — plain-text auto-link, consistent with the checkin-route alerts which already use `toE164`). Ponytail: do NOT add per-worker action buttons to the alert — a tappable number is the ask.
**Open Q:** none.

### AL4 — Checkout alarm shows the wrong time / fires wrongly (bug)
**Root confirmed (display half):** `formatExpectedTime(iso) = iso.slice(11,16)` (`route.ts:8–10`) slices the **UTC** `HH:MM` straight off `expectedAt` (which is `new Date(inEnd).toISOString()`, i.e. UTC). So the "expected" time shown to admins is UTC, not `Asia/Jerusalem` — e.g. a shift ending 08:00 Jerusalem (=05:00 UTC in summer) is displayed as its UTC value, not 08:00. This is the confirmed cause of "expected 04:00" for a shift that ends at 8.
**Approach (display):** format `expectedAt` in `COMPANY_TZ` using `Intl.DateTimeFormat('en-GB', { timeZone: COMPANY_TZ, hour, minute, hour12:false })` (the same `hhmm` helper already used in `api/checkin/route.ts:22` and `attendance-client.tsx:12`) instead of `iso.slice(11,16)`.
**Root (firing half — needs confirmation):** `endMs` in `missed-checkins.ts:21–28` uses `useNextDay = end < start` to roll an overnight shift's end to the next calendar day. There may be a **premature-fire / overnight** edge where the checkout alarm triggers against the wrong `endMs`. The controller flags that fully confirming the premature-fire half **requires Leonid Kogan's actual shift start/end** (the example: "expected 04:00" but his shift ends at 8). Spec a careful re-check of the `type:'out'` firing condition (`now > inEnd + grace`, with AL1's 15-min grace) against a real overnight case — do not change the `endMs` logic blindly; verify with Leonid's real times first.
**Files:** `packages/web/app/api/cron/missed-checkins/route.ts` (`formatExpectedTime` → TZ-aware), `packages/worklog-core/src/data/missed-checkins.ts` (`endMs` / checkout firing condition — review, pending Leonid's real shift).
**Decision:** the **display** fix (format in `COMPANY_TZ`) is confirmed and lands now — it alone explains the wrong displayed time. The **firing** review is gated on the PM supplying Leonid's actual shift start/end; treat it as a separate verify-then-fix so we don't chase a phantom overnight bug. Add a unit test for the TZ formatting (summer UTC+3 / winter UTC+2 both).
**Open Q (roundup):** need **Leonid Kogan's real shift start/end** to confirm whether there is also a premature-fire/overnight `endMs` bug beyond the display fix.

---

## Open questions for the PM (roundup)

1. **AL4 — Leonid's real shift.** Provide Leonid Kogan's actual scheduled start/end so we can confirm whether the checkout alarm also fires prematurely (overnight `endMs`), or whether the UTC-vs-Jerusalem display bug fully explains it (the display fix lands regardless).
2. **R1 — report layout.** Match the PM's example workbook indentation/title placement cell-for-cell, or leave the current (structurally-correct, headers-present) layout? And: run the one-time attendance/assignment **phone repair** now (recommended) or rely only on the per-read normalize?
3. **MR1 — role mechanism.** A single `role` column (`worker|manager|admin`, recommended, with an `admin='yes'` read fallback) vs keeping `admin` and adding a separate `manager` boolean?
4. **S4 — export details.** Export UI location (place detail page vs attendance page)? And zip library choice — add a small dep (`jszip`/`archiver`) or hand-roll a store-only zip? Plus confirm the 45-day GCS lifecycle window and that `checkins/` is the whole bucket.
5. **Existing un-normalized phones.** Should we repair stored `Attendance`/`ShiftAssignments` phone values now (controller-run, idempotent), or defer and let the per-read normalize carry it? (Recommended: repair now.)
6. **S3 — selfie-denied escape hatch.** If camera/GPS is denied on a required-selfie leg, hard-block the check-in (no selfie = no check-in, mirroring the geofence block) or allow an override?
7. **P2 — manager view of Billing rate.** Fully hidden, or shown read-only/greyed for managers? (Lean fully hidden.)

---

## Testing (house rule)
Every item ships with unit + integration coverage. Pure `worklog-core` additions (selfie-flag parse, `compressImage`/`photoZipEntryName` helpers, report phone-normalize in joins/filter, `repairAttendancePhones`, `findMissedCheckins` 15-min checkout grace + TZ-agnostic firing, role fallback in `parseWorker`) → Node test runner, TDD. Route/UI changes (inline assign, selfie capture flow + server guard, attendance start/end editing, map active filter, per-object export, manager gating on pages/routes/nav, per-location alarm messages + E.164) → typecheck + build + route-level tests. A `test(review):` pass per the CLAUDE.md gate before review.
