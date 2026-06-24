# Phase 2a — Check-in / Check-out — Design Spec

**Date:** 2026-06-24
**Status:** Approved design — ready for implementation plan
**Project:** `flow-cat`. See `docs/prd-discovery.md` (§8) and the Phase 1b shifts model.

## 1. Purpose

Field staff check in and out of their assigned shift instances from the web
client, capturing timestamp + geolocation + (optional) photo, with a per-location
geofence flag. **Check-in/out timestamps are the hours of record** (manual
WorkLogs entry becomes an admin correction). Produces the `Attendance` data that
payroll (2b) and reports (Phase 5) consume.

## 2. Key Decisions (locked, from discovery §8)

| Decision | Choice |
|---|---|
| Hours of record | Check-in/out timestamps. `hours = (checkOut − checkIn)` in hours (absolute timestamps ⇒ overnight needs no special case). |
| Photo | Stored for manual review in **GCS** (bucket env `CHECKIN_PHOTOS_BUCKET`). **Optional/gated:** if the bucket env is unset, check-in still works and stores an empty photo URL. |
| Geofence | Per-location radius (`Places.geofence_radius_m`, default 100m). **Allow + flag** — never blocks; stores `in_geofence` boolean computed from haversine distance. |
| GPS | Browser geolocation; coarse/spoofable accepted (no anti-spoofing). |
| Forgot to check out | Resolved manually by admin (`adminCorrect`). |
| Mid-shift check-in | A worker may check in after the shift start (late) — allowed; lateness is derivable (check_in_at vs instance start) but not blocked. |

## 3. Data Model — new `Attendance` tab

One row per (employee, shift instance) attendance record.

| Column | Meaning |
|---|---|
| `id` | `att_<8hex>` |
| `instance_id` | the shift instance (`ShiftInstances.id`) |
| `employee_phone` | normalized worker key |
| `date` | instance date `YYYY-MM-DD` (denormalized) |
| `check_in_at` | ISO timestamp |
| `check_in_lat` / `check_in_lng` | strings |
| `check_in_photo` | GCS URL or `''` |
| `check_in_in_geofence` | `yes`/`no` |
| `check_out_at` | ISO timestamp or `''` |
| `check_out_lat` / `check_out_lng` / `check_out_photo` / `check_out_in_geofence` | as above (blank until checkout) |
| `hours` | computed on checkout (`''` while open) |
| `status` | `open` (checked in) / `closed` (checked out) / `corrected` (admin-adjusted) |

## 4. Data Layer (worklog-core) — `data/attendance.ts`

- `interface Attendance { id; instanceId; employeePhone; date; checkInAt; checkInLat; checkInLng; checkInPhoto; checkInInGeofence: boolean; checkOutAt; ...; hours: string; status; }`
- `distanceMeters(lat1, lng1, lat2, lng2): number` — haversine (pure, tested).
- `withinGeofence(distM, radiusM): boolean`.
- `hoursBetween(checkInIso, checkOutIso): number` — `(out − in)/3600000`, rounded to 2dp; returns `0` if invalid.
- `listAttendance(gateway, { instanceId?, employeePhone?, from?, to? }): Promise<Attendance[]>`.
- `checkIn(gateway, { instanceId, employeePhone, at, lat, lng, photo, inGeofence }): Promise<{ ok: true; id } | { ok: false; error }>` — rejects if an `open` record already exists for that (instance, employee). Looks up the instance to copy `date`.
- `checkOut(gateway, { instanceId, employeePhone, at, lat, lng, photo, inGeofence }): Promise<{ ok: true; hours } | { ok: false; error }>` — finds the open record, fills checkout fields, computes `hours`, sets `status=closed`.
- `adminCorrect(gateway, attendanceId, { checkInAt?, checkOutAt?, hours? }): Promise<{ ok: true } | { ok: false; error }>` — admin override; recomputes/overwrites `hours`, sets `status=corrected`.

All header-driven via the gateway; `updateRow` 1-based (i+1). Timestamps via `new Date().toISOString()` at the call site (passed in, so the data layer stays pure/testable with fixed values).

## 5. Photo storage (web) — `lib/gcs.ts`, gated

- `storeCheckinPhoto(dataUrl: string | undefined, key: string): Promise<string>` — if `CHECKIN_PHOTOS_BUCKET` unset or no photo, returns `''`. Else decodes the base64 data URL and uploads to `gs://<bucket>/checkins/<key>.jpg` using `@google-cloud/storage` with the existing `GOOGLE_SERVICE_ACCOUNT_JSON` credentials; returns the object's URL. Best-effort: on upload error, logs and returns `''` (never blocks check-in).
- This is the only Phase-2a piece needing external setup: a GCS bucket + the service account granted `storage.objectAdmin` on it.

## 6. Worker check-in UI

- **`/app/checkin`** (worker-authenticated via existing `requireWorker`): lists the worker's shift instances for **today** (and recent open ones) — derived from `ShiftAssignments` where `employee_phone = me` joined to `ShiftInstances` for today. Each shows location · time · status with a **Check in** or **Check out** button (state from the worker's `Attendance` row for that instance).
- On tap: the client gets `navigator.geolocation` coordinates and optionally a photo (`<input type="file" accept="image/*" capture="user">` → base64), POSTs to `/api/checkin`.
- **`POST /api/checkin`** (`requireWorker`): body `{ instanceId, action: 'in'|'out', lat, lng, photo? }`. Server: loads the instance + its location, computes `inGeofence` via `distanceMeters` vs the location's `geofence_radius_m`, stores the photo via `storeCheckinPhoto`, then calls `checkIn`/`checkOut` with `at = new Date().toISOString()`. Identity from the session — never from the body. Returns `{ ok, hours? }` or an error.

## 7. Admin surface (minimal in 2a)

- On `/admin`, a link to **`/admin/attendance`**: a read-only list of recent attendance (date · employee · location · in/out times · hours · geofence flag · photo link), filterable by date range. The `adminCorrect` data-layer function exists; a minimal inline "edit hours" control is acceptable but the rich correction UI can follow. (Forgot-to-checkout is fixed here.)

## 8. Security

- `requireWorker` on `/app/checkin` + `/api/checkin`; identity strictly from the session cookie (never body). A worker can only check into instances assigned to them — the route verifies an active `ShiftAssignment` for (instance, session-phone) before recording.
- `requireAdmin` on `/admin/attendance`.
- Photos: a worker uploads only their own check-in image; stored in GCS for manual review, not publicly enumerated (object key includes the attendance id).
- `runtime='nodejs'` on the routes/pages.

## 9. Testing

- **worklog-core:** `distanceMeters` (known coordinate pairs), `withinGeofence`, `hoursBetween` (incl. overnight across midnight via absolute timestamps, invalid → 0), `checkIn` (rejects double-open), `checkOut` (computes hours, closes), `adminCorrect`, `listAttendance` filtering.
- **web:** the geofence/identity guard logic where extractable; `storeCheckinPhoto` no-op-without-bucket path. (No route-test harness — typecheck + build.)

## 10. Out of Scope

- Payroll computation from these hours (Phase 2b).
- Real-time missed-checkin alerts (Phase 4 — the scheduler).
- Periodic during-shift presence pings (only late check-in is in scope).
- Face matching / anti-spoofing.
- Rich admin attendance-correction UI beyond editing hours (later).
