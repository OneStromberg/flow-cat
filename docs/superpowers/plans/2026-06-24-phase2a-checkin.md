# Phase 2a — Check-in / Check-out — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Field staff check in/out of assigned shift instances from the web client (timestamp + GPS + geofence flag + optional GCS photo); check-in/out timestamps become the hours of record in a new `Attendance` tab.

**Architecture:** Pure, unit-tested attendance + geofence + hours data layer in `@scourage/worklog-core`; worker check-in API/page and admin attendance view in `@scourage/web`; gated GCS photo upload via the existing `googleapis` dep (no new dependency).

**Tech Stack:** TypeScript, Next.js 15 App Router, Google Sheets + GCS via `googleapis`, Node test runner via `tsx`.

## Global Constraints

- worklog-core ESM `.ts` imports; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; verify `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`; web tests glob `lib/**/*.test.ts`.
- `gateway.updateRow(tab, rowNumber, row)` is 1-based (row 1 = header): data row at 0-based array index `i` → `rowNumber = i + 1`.
- Hours = `(checkOut − checkIn)/3600000` from absolute ISO timestamps (no overnight special-case).
- Geofence: haversine distance vs `Places.geofence_radius_m` (default 100); **allow + flag**, never block.
- Photo + GCS are GATED on `CHECKIN_PHOTOS_BUCKET`; unset ⇒ check-in still works, photo URL stored as `''`.
- Worker identity comes from the session (`requireWorker`), NEVER from the request body. A worker may only check into an instance they have an active `ShiftAssignment` for.
- Admin-guarded admin pages; `runtime='nodejs'`. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: Attendance data layer (geofence, hours, check-in/out)

**Files:** Create `packages/worklog-core/src/data/attendance.ts` + `attendance.test.ts`; export from `index.ts`.

**Interfaces — Produces:**
```ts
interface Attendance { id; instanceId; employeePhone; date; checkInAt; checkInLat; checkInLng; checkInPhoto; checkInInGeofence: boolean; checkOutAt; checkOutLat; checkOutLng; checkOutPhoto; checkOutInGeofence: boolean; hours: string; status: string; }
distanceMeters(lat1:number,lng1:number,lat2:number,lng2:number): number
withinGeofence(distM:number, radiusM:number): boolean
hoursBetween(checkInIso:string, checkOutIso:string): number
listAttendance(gateway, { instanceId?, employeePhone?, from?, to? }): Promise<Attendance[]>
checkIn(gateway, { instanceId, employeePhone, at, lat, lng, photo, inGeofence }): Promise<{ok:true;id}|{ok:false;error}>
checkOut(gateway, { instanceId, employeePhone, at, lat, lng, photo, inGeofence }): Promise<{ok:true;hours:string}|{ok:false;error}>
adminCorrect(gateway, attendanceId, { checkInAt?, checkOutAt?, hours? }): Promise<{ok:true}|{ok:false;error}>
```

- [ ] **Step 1: Failing tests** — `attendance.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { distanceMeters, withinGeofence, hoursBetween, checkIn, checkOut, listAttendance } from './attendance.ts';

test('distanceMeters ~ haversine (Tel Aviv ~ 1 deg lat ≈ 111km)', () => {
  const d = distanceMeters(32.0, 34.0, 33.0, 34.0);
  assert.ok(Math.abs(d - 111195) < 500); // ~111 km
  assert.ok(distanceMeters(32.08, 34.78, 32.08, 34.78) < 1); // same point ~ 0
});
test('withinGeofence', () => {
  assert.equal(withinGeofence(80, 100), true);
  assert.equal(withinGeofence(120, 100), false);
});
test('hoursBetween (absolute timestamps, overnight needs no special case)', () => {
  assert.equal(hoursBetween('2026-07-01T22:00:00.000Z', '2026-07-02T06:00:00.000Z'), 8);
  assert.equal(hoursBetween('2026-07-01T08:00:00.000Z', '2026-07-01T16:30:00.000Z'), 8.5);
  assert.equal(hoursBetween('bad', '2026-07-01T16:00:00.000Z'), 0);
});
function gw() {
  return createMemoryGateway({
    ShiftInstances: [['id','template_id','location','date','start','end','headcount','status','generated_at'],
      ['tpl_1_20260701','tpl_1','Site A','2026-07-01','22:00','06:00','2','scheduled','']],
    Attendance: [['id','instance_id','employee_phone','date','check_in_at','check_in_lat','check_in_lng','check_in_photo','check_in_in_geofence','check_out_at','check_out_lat','check_out_lng','check_out_photo','check_out_in_geofence','hours','status']],
  });
}
test('checkIn then checkOut computes hours and closes; double check-in rejected', async () => {
  const g = gw();
  const ci = await checkIn(g, { instanceId:'tpl_1_20260701', employeePhone:'15551230000', at:'2026-07-01T22:00:00.000Z', lat:'32.08', lng:'34.78', photo:'', inGeofence:true });
  assert.equal(ci.ok, true);
  const dup = await checkIn(g, { instanceId:'tpl_1_20260701', employeePhone:'15551230000', at:'2026-07-01T22:05:00.000Z', lat:'32.08', lng:'34.78', photo:'', inGeofence:true });
  assert.equal(dup.ok, false);
  const co = await checkOut(g, { instanceId:'tpl_1_20260701', employeePhone:'15551230000', at:'2026-07-02T06:00:00.000Z', lat:'32.08', lng:'34.78', photo:'', inGeofence:true });
  assert.equal(co.ok, true); if (co.ok) assert.equal(co.hours, '8');
  const list = await listAttendance(g, { employeePhone:'15551230000' });
  assert.equal(list.length, 1); assert.equal(list[0].status, 'closed'); assert.equal(list[0].hours, '8');
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement `attendance.ts`** — header-driven via the gateway (mirror `shift-instances.ts`). Key bits:
```ts
const ATT_COLUMNS = ['id','instance_id','employee_phone','date','check_in_at','check_in_lat','check_in_lng','check_in_photo','check_in_in_geofence','check_out_at','check_out_lat','check_out_lng','check_out_photo','check_out_in_geofence','hours','status'];

export function distanceMeters(lat1:number,lng1:number,lat2:number,lng2:number):number {
  const R=6371000, toRad=(d:number)=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(a)));
}
export function withinGeofence(distM:number,radiusM:number):boolean { return distM<=radiusM; }
export function hoursBetween(a:string,b:string):number {
  const t1=Date.parse(a), t2=Date.parse(b);
  if (!Number.isFinite(t1)||!Number.isFinite(t2)) return 0;
  return Math.round(((t2-t1)/3600000)*100)/100;
}
```
  - `checkIn`: load instance row for `date`; reject (`{ok:false,error:'already checked in'}`) if an existing Attendance row matches `(instance_id, employee_phone)` with `status==='open'`. Append `id='att_'+crypto.randomUUID().slice(0,8)`, `status:'open'`, `check_in_in_geofence: inGeofence?'yes':'no'`, blank checkout fields, blank hours.
  - `checkOut`: find the open row (array index `i`); fill checkout fields, `hours=String(hoursBetween(check_in_at, at))`, `status='closed'`; `updateRow(tab, i+1, ...)`. Reject if no open row.
  - `adminCorrect`: find by id; overwrite provided fields; if both timestamps present recompute hours else use provided `hours`; `status='corrected'`; updateRow with `i+1`.
  - `listAttendance`: parse rows (`check_in_in_geofence==='yes'` → boolean), filter by provided instanceId/employeePhone and `date` range.

- [ ] **Step 4: Export** the functions + `Attendance` type from `index.ts`.

- [ ] **Step 5: Run — pass + typecheck.**

- [ ] **Step 6: Commit.** `git commit -m "feat(core): attendance data layer (geofence, hours, check-in/out, admin correct)"`

---

### Task 2: Worker check-in API + page (no photo yet)

**Files:** Create `packages/web/app/api/checkin/route.ts`, `packages/web/app/app/checkin/page.tsx`, `packages/web/app/app/checkin/checkin-client.tsx`. (The worker area lives under `app/app/` — confirm by reading the existing `app/app/` worker pages.)

**Interfaces — Consumes:** `checkIn`/`checkOut`/`listAttendance`/`distanceMeters`/`withinGeofence` (T1), `listInstances`, `listAssignments`, `loadActivePlaces`/`listPlaces` (for the instance's location coords + radius), `requireWorker`, `getGateway`.

- [ ] **Step 1: `POST /api/checkin`** — `requireWorker` (401 if none); body `{ instanceId, action:'in'|'out', lat, lng }`. Verify the session worker has an active `ShiftAssignment` for `instanceId` (via `listAssignments({ instanceId })` includes `worker.phone`); else 403. Load the instance and its location (`listPlaces` → find by `instance.location`) to get the geofence center + `geofenceRadiusM`; compute `inGeofence = withinGeofence(distanceMeters(lat,lng, placeLat,placeLng), radius)`. Call `checkIn`/`checkOut` with `at=new Date().toISOString()`, `photo:''`. Return `{ ok, hours? }` / error. Identity strictly from session.

- [ ] **Step 2: `/app/checkin` server page** — `requireWorker`→redirect to `/login`; load the worker's today instances: `listInstances({ from: today, to: today })` filtered to those whose id appears in the worker's `listAssignments({ employeePhone: worker.phone })` (or filter instances by `listAssignments({ instanceId })` containing the worker); attach the worker's current `Attendance` per instance (status). Pass to `<CheckinClient>`. `runtime='nodejs'`, `dynamic='force-dynamic'`.

- [ ] **Step 3: `checkin-client.tsx`** (`'use client'`) — for each instance, show location · time · state and a **Check in**/**Check out** button. On tap: `navigator.geolocation.getCurrentPosition` → POST `{ instanceId, action, lat, lng }` to `/api/checkin`; on success `router.refresh()`; show geofence-warning text if the response flags out-of-zone. Handle geolocation denial with a clear message.

- [ ] **Step 4: Verify.** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`.

- [ ] **Step 5: Commit.** `git commit -m "feat(web): worker check-in/out (GPS + geofence flag, session identity)"`

---

### Task 3: GCS photo upload (gated) + wire into check-in

**Files:** Create `packages/web/lib/gcs.ts` + `packages/web/lib/gcs.test.ts`; modify `packages/web/app/api/checkin/route.ts` + `checkin-client.tsx` to carry an optional photo.

- [ ] **Step 1: Failing test** — `gcs.test.ts` for the gated no-op path (pure, no network):
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeDataUrl, photoObjectName } from './gcs.ts';
test('photoObjectName namespaces by attendance key', () => {
  assert.equal(photoObjectName('att_abc', 'in'), 'checkins/att_abc-in.jpg');
});
test('decodeDataUrl parses a base64 image data url', () => {
  const out = decodeDataUrl('data:image/jpeg;base64,' + Buffer.from('hi').toString('base64'));
  assert.ok(out && out.buffer.toString() === 'hi' && out.contentType === 'image/jpeg');
  assert.equal(decodeDataUrl('not-a-data-url'), null);
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement `gcs.ts`.** First add googleapis to the web package: `pnpm --filter @scourage/web add googleapis` (already resolved in the lockfile via sheets-helper, so this just declares the direct dep). Implement using `googleapis` + the SA creds (reuse `parseServiceAccountJson` from `@scourage/sheets-helper` and a `google.auth.GoogleAuth` with scope `https://www.googleapis.com/auth/devstorage.read_write`). Pure helpers `decodeDataUrl(dataUrl)` (→ `{buffer, contentType}` or null) and `photoObjectName(key, which)` are exported for tests. `storeCheckinPhoto(dataUrl, key, which): Promise<string>` — returns `''` if `CHECKIN_PHOTOS_BUCKET` unset or `decodeDataUrl` returns null; else uploads via `google.storage('v1').objects.insert({ bucket, name, media:{ mimeType, body: Buffer } })`; on any error logs and returns `''`. Returns the `https://storage.googleapis.com/<bucket>/<name>` URL on success.

- [ ] **Step 4: Wire photo** — `checkin-client.tsx`: add an optional `<input type="file" accept="image/*" capture="user">`, read as base64 data URL, include `photo` in the POST. Route: accept `photo?`, call `storeCheckinPhoto(photo, attendanceKey, action)` and pass the resulting URL into `checkIn`/`checkOut`. (Use the instance id + phone for the key.)

- [ ] **Step 5: Verify.** `pnpm --filter @scourage/web test && pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`.

- [ ] **Step 6: Commit.** `git commit -m "feat(web): gated GCS check-in photo upload"`

---

### Task 4: Admin attendance view

**Files:** Create `packages/web/app/admin/attendance/page.tsx` (+ a small client for the date filter / edit-hours if needed); create `packages/web/app/api/admin/attendance/route.ts` for `adminCorrect`; add an "Attendance" link on `/admin`.

- [ ] **Step 1: Server page** `/admin/attendance` — `requireAdmin`→redirect; load `listAttendance({ from, to })` (default last 14 days; date range from search params). Render a table: date · employee phone · location (via instance) · check-in time · check-out time · hours · geofence flags · photo links. Add an "Attendance" link on `/admin`.

- [ ] **Step 2: `POST /api/admin/attendance`** — `requireAdmin`; body `{ attendanceId, checkInAt?, checkOutAt?, hours? }` → `adminCorrect`; return `{ ok }`. (Covers forgot-to-checkout fixes.)

- [ ] **Step 3: Minimal correction control** — an inline "edit hours" input per row that POSTs to the route and `router.refresh()`. Keep it simple.

- [ ] **Step 4: Verify.** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`.

- [ ] **Step 5: Commit.** `git commit -m "feat(web): admin attendance view + hours correction"`

---

## Self-Review Notes
- **Spec coverage:** Attendance tab + hours-of-record (T1), geofence flag allow-not-block (T1/T2), worker check-in UI with GPS + session identity + assignment check (T2), gated GCS photo (T3), admin view + forgot-checkout correction (T4). Mid-shift/late check-in allowed implicitly (no start-time gate). Tests focus on the pure core (T1) + GCS gating (T3).
- **Type consistency:** `Attendance`/`checkIn`/`checkOut`/`hoursBetween`/`distanceMeters`/`withinGeofence` (T1) consumed by T2/T4; `storeCheckinPhoto`/`decodeDataUrl`/`photoObjectName` (T3) by the route.
- **No new deps** (GCS via existing `googleapis`). Photo + cron + telegram all gated on env.
