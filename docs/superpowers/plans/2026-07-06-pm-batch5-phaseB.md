# PM Batch 5 — Phase B (smaller features) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Ship batch-5 features with no hard blockers (spec: `docs/superpowers/specs/2026-07-06-pm-batch5-phaseB-design.md`).

**Tech Stack:** TypeScript, Next.js 15, Google Sheets, Node test runner.

## Global Constraints
- worklog-core ESM `.ts` imports; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; `pnpm --filter @scourage/web typecheck && build`.
- `updateRow` 1-based; append-only / soft-delete. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: 30-day login persistence (feat 5)
**Files:** `packages/web/lib/session.ts`.
- [ ] **Step 1:** Read `setSessionCookie` (and `readSession`/`writeSession`). It sets `fc_session` with `{ httpOnly, secure, sameSite:'lax', path:'/' }` and no `maxAge`.
- [ ] **Step 2:** Add `maxAge: 60 * 60 * 24 * 30` (30 days) to the cookie options in `setSessionCookie`. If the signed session payload embeds an `exp`/timestamp that would expire sooner, extend it to ≥30 days (or confirm it's stateless — then no change). Keep `clearSession`'s `maxAge:0`.
- [ ] **Step 3:** `pnpm --filter @scourage/web typecheck && build` → pass.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): persist login 30 days (feat 5)"`

---

### Task 2: check-out minimum-duration guard (feat 8)
**Files:** `packages/worklog-core/src/data/attendance.ts` (`checkOut`); test `attendance.test.ts`.
- [ ] **Step 1: Failing test** — a check-in at `T`, checkout at `T+30s` → rejected; checkout at `T+90s` → ok:
```ts
test('checkOut rejects a checkout less than 60s after check-in', async () => {
  const g = createMemoryGateway({ Attendance: [
    ['id','instance_id','employee_phone','date','check_in_at','check_in_lat','check_in_lng','check_in_photo','check_in_in_geofence','check_out_at','check_out_lat','check_out_lng','check_out_photo','check_out_in_geofence','hours','status'],
    ['a1','i1','p1','2026-07-06','2026-07-06T08:00:00.000Z','','','','yes','','','','','','','open'],
  ]});
  const tooSoon = await checkOut(g, { instanceId:'i1', employeePhone:'p1', at:'2026-07-06T08:00:30.000Z', lat:'', lng:'', photo:'', inGeofence:true });
  assert.equal(tooSoon.ok, false);
  const ok = await checkOut(g, { instanceId:'i1', employeePhone:'p1', at:'2026-07-06T08:01:30.000Z', lat:'', lng:'', photo:'', inGeofence:true });
  assert.equal(ok.ok, true);
});
```
- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement** — in `checkOut`, after finding the open row + its `checkInAt`, before writing: if `Date.parse(params.at) - Date.parse(checkInAt) < 60_000` return `{ ok:false, error:'too_soon' }`. (Guard against unparseable dates — only enforce when both parse.)
- [ ] **Step 4: Run — pass + typecheck.** Confirm existing checkOut tests still pass (their times are >60s apart or adjust none).
- [ ] **Step 5: Commit.** `git commit -m "feat(core): 60s minimum before check-out (feat 8)"`

---

### Task 3: delete + alphabetical places (feat 7)
**Files:** `packages/worklog-core/src/data/places.ts` (`deletePlace` + test), a delete route, and the places list page.
- [ ] **Step 1: Failing test** (`places.test.ts`) — `deletePlace(g,'Site A')` sets active=no; `listPlaces` shows it inactive; unknown name → `{ok:false}`:
```ts
test('deletePlace soft-deletes (active=no)', async () => {
  const g = createMemoryGateway({ Places: [
    ['place_name','active','lat','lng','place_id','address','client','geofence_radius_m','contact','base_rate','required_attributes','notes','grace_mins'],
    ['Site A','yes','1','2','','','','100','','','','',''],
  ]});
  assert.equal((await deletePlace(g,'Site A')).ok, true);
  assert.equal((await listPlaces(g)).find((p)=>p.name==='Site A')?.active, false);
  assert.equal((await deletePlace(g,'Nope')).ok, false);
});
```
- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement** `deletePlace(gateway, name): Promise<{ok:true}|{ok:false;error:string}>` in `places.ts` — find the row by `place_name===name`, set `active='no'`, `updateRow(idx+1)`; `{ok:false,error:'Not found'}` if absent. Export from `src/index.ts`.
- [ ] **Step 4:** Route `packages/web/app/api/admin/places/route.ts` — add a `DELETE` (or `action:'delete'`) branch: `requireAdmin`, body `{ name }`, call `deletePlace(getGateway(), name)`, return `{ok}`.
- [ ] **Step 5:** Places list page (`admin/places/page.tsx`): (a) sort `places` by `name` with `localeCompare` before rendering; (b) filter to `active` places only (hide soft-deleted); (c) add a small **Delete** control per row (a `'use client'` button: `confirm('Delete this place?')` → DELETE → `router.refresh()`).
- [ ] **Step 6:** `pnpm --filter @scourage/worklog-core test` pass; `pnpm --filter @scourage/web typecheck && build` pass.
- [ ] **Step 7: Commit.** `git commit -m "feat: sort places alphabetically + soft-delete place (feat 7)"`

---

### Task 4: PWA manifest + icon (feat 4)
**Files:** create `packages/web/app/manifest.ts`, `packages/web/app/icon.svg`, and (optional) `apple-icon.svg`.
- [ ] **Step 1:** `app/manifest.ts` — export default a `MetadataRoute.Manifest`: `{ name:'FlowCat', short_name:'FlowCat', start_url:'/', display:'standalone', background_color:'#ffffff', theme_color:'#111827', icons: [{ src:'/icon.svg', sizes:'any', type:'image/svg+xml' }] }`. (Next.js serves it at `/manifest.webmanifest` and auto-links it.)
- [ ] **Step 2:** `app/icon.svg` — a simple branded square (e.g. dark rounded bg `#111827` with a white "FC" or a clock/cat glyph). Also add `app/apple-icon.svg` (same art) for iOS "Add to home screen". Keep it a clean minimal SVG.
- [ ] **Step 3:** Confirm the root layout's `metadata` doesn't override the manifest link; if there's a `metadata` export, add `manifest: '/manifest.webmanifest'` only if Next doesn't auto-wire it (it usually does via the file convention — no change needed).
- [ ] **Step 4:** `pnpm --filter @scourage/web typecheck && build` → pass (manifest + icon routes present in build output).
- [ ] **Step 5: Commit.** `git commit -m "feat(web): PWA manifest + installable icon (feat 4)"`

---

### Task 5: Self-registration + city dropdown (feat 1 + 2)
**Files:** create `packages/web/app/register/page.tsx` + `register-form.tsx`, `packages/web/app/api/register/route.ts`; link "Register" from the login page.
- [ ] **Step 1: Route** `POST /api/register` (PUBLIC — no admin guard). Body = the self-serve fields. Build an `AddWorkerInput` with **`places: []`, `payStructure:'', payRate:''`** and the submitted `phone, teudatZeut, name, city, age, transportation, hebrewLevel, gender, schedule` (payType/payAmount empty or as submitted). Call `addWorker(getGateway(), input)`. On `{ok:false,errors}` → 400 with errors (addWorker already enforces non-blank + unique phone + enum validity). On success → `{ok:true}`. `runtime='nodejs'`.
- [ ] **Step 2: Page** `/register/page.tsx` — PUBLIC (no requireAdmin). Load city options via `loadCities(getRequestGateway())` + the enum option lists (`TRANSPORTATION, HEBREW_LEVEL, SCHEDULE, GENDER` from `@scourage/worklog-core`). Render `<RegisterForm cities={...} enums={...} />`. `runtime='nodejs'`,`dynamic='force-dynamic'`.
- [ ] **Step 3: `register-form.tsx`** (`'use client'`) — fields: name, phone, teudat zeut (required), city (`<select>` from cities + a free-text fallback if empty), age, transportation, hebrew level, gender, schedule. NO places, NO pay fields. Submit → POST `/api/register`; on success show "Registered — you can now log in" + a link to `/login`; on 400 show field errors.
- [ ] **Step 4:** Add a "New here? Register" link on `/login/page.tsx` → `/register`.
- [ ] **Step 5:** `pnpm --filter @scourage/web typecheck && build` → pass.
- [ ] **Step 6: Commit.** `git commit -m "feat(web): worker self-registration + city dropdown (feat 1/2)"`

---

## Self-Review Notes
- **Coverage:** feat5→T1 · feat8→T2 · feat7→T3 · feat4→T4 · feat1→T5 · feat2→T5 (mechanism; Cities tab data is user-supplied).
- **Type consistency:** `deletePlace` (T3 core) consumed by T3 route. Registration reuses `addWorker`/`AddWorkerInput`/`loadCities`.
- **Ordering:** all largely independent; T2/T3 are core-first (TDD). T3 route+UI after `deletePlace`.
