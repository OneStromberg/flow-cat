# PM Batch 5 — Phase A (reliability bugs) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Fix bugs 0–3 (spec: `docs/superpowers/specs/2026-07-06-pm-batch5-phaseA-bugs-design.md`).

**Architecture:** worklog-core = pure data/logic (Node test runner, TDD). web = Next.js (typecheck + build).

**Tech Stack:** TypeScript, Next.js 15, Google Sheets, Node test runner.

## Global Constraints
- worklog-core ESM `.ts` imports; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; verify `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`.
- `gateway.updateRow` 1-based. Rows append-only / soft-deleted.
- Commit author = OneStromberg; **LOCAL commits only**. ponytail.

---

### Task 1: `seedTemplateInstances` — targeted, awaited seeder (Fix A core, #1+#3)
**Files:** Modify `packages/worklog-core/src/data/shift-instances.ts`; export from `src/index.ts`; test `shift-instances.test.ts`.

**Produces:** `seedTemplateInstances(gateway, templateId, today, horizonDays=42): Promise<{ instancesCreated: number; assignmentsSeeded: number }>` — like `generateInstances` but scoped to ONE template: create its missing instances within `[today, today+horizon)`, and seed its **active** recurring assignments into all its instances in range (existing + new). Idempotent (same id + assign-key guards as `generateInstances`).

- [ ] **Step 1:** Read `generateInstances` (~lines 174-300) — reuse its helpers (`addDays`, `weekday`, `compact`, `ensureInstanceHeader`, `ensureAssignHeader`, `listRecurring`, the id `${tpl.id}_${compact(date)}`, the `existingIds`/`existingAssignKeys` sets, the instance record + assignment record shapes).
- [ ] **Step 2: Failing test** in `shift-instances.test.ts` (mirror the existing generate tests' seed style): a template `t1` (location Site A, one dayTime for the weekday of a known date), an active recurring assignment for `p1`, and an ALREADY-EXISTING instance for `t1` on that date with NO assignment. Call `seedTemplateInstances(g, 't1', <today covering that date>)`. Assert the existing instance now has an `assigned` ShiftAssignments row for `p1` (i.e. `assignmentsSeeded >= 1`), and a second call seeds 0 (idempotent).
```ts
test('seedTemplateInstances seeds recurring into existing instances (idempotent)', async () => {
  // build gateway: ShiftTemplates (t1, active, dayTimes covering 2026-07-06=Mon 08:00-16:00),
  // RecurringAssignments (t1|p1 active), ShiftInstances (t1_20260706 existing, no assignment),
  // ShiftAssignments (header only). Use the same column headers the other tests use.
  const g = /* ...createMemoryGateway with the above... */;
  const r1 = await seedTemplateInstances(g, 't1', '2026-07-06', 42);
  assert.ok(r1.assignmentsSeeded >= 1);
  const assigns = rowsToObjects(g.dump()['ShiftAssignments']).filter((o) => o.instance_id === 't1_20260706' && o.employee_phone === 'p1');
  assert.equal(assigns.length, 1);
  const r2 = await seedTemplateInstances(g, 't1', '2026-07-06', 42);
  assert.equal(r2.assignmentsSeeded, 0);
});
```
(Read a neighboring generate test to copy the exact seed column layout; adjust the date so its weekday matches the template's dayTime.)
- [ ] **Step 3: Run — fail.**
- [ ] **Step 4: Implement** `seedTemplateInstances` — copy `generateInstances`'s body but: load only the ONE template (`listTemplates` → find by id, must be active; if not found/inactive return `{instancesCreated:0,assignmentsSeeded:0}`), build `existingIds`/`existingAssignKeys` from the sheet as generate does, then run the single-template loop (instance-create-if-missing + seed active recurring). Return the two counts.
- [ ] **Step 5: Export** from `src/index.ts` (shift-instances line).
- [ ] **Step 6: Run — pass + typecheck.**
- [ ] **Step 7: Commit.** `git commit -m "feat(core): seedTemplateInstances targeted seeder (#1/#3)"`

---

### Task 2: `setWorkerPhone(token, newPhone)` — repair by token (Fix C core, #0)
**Files:** Modify `packages/worklog-core/src/data/add-worker.ts` (or `workers.ts` — put it beside `updateWorker`); export from `src/index.ts`; test.

**Produces:** `setWorkerPhone(gateway, token, newPhone): Promise<{ ok: true } | { ok: false; error: string }>` — find the worker row by exact `token`; validate `normalizePhone(newPhone)` is non-blank and NOT used by a DIFFERENT row; write the normalized phone into that row's `phone` cell via `updateRow`.

- [ ] **Step 1:** Read `addWorker` (its non-blank + uniqueness validation using `normalizePhone`) and `updateWorker` (row-find + updateRow pattern) to mirror style. Confirm the `token` column name (`token`).
- [ ] **Step 2: Failing test** (worker test file):
```ts
test('setWorkerPhone repairs a blank-phone worker, matched by token', async () => {
  const g = /* Workers with headers incl. phone, token; one row token='tk1' phone='' name='Roma' */;
  const r = await setWorkerPhone(g, 'tk1', '0501234567');
  assert.equal(r.ok, true);
  const w = (await listWorkers(g)).find((x) => x.token === 'tk1');
  assert.equal(w?.phone, '972501234567'); // normalized
  assert.equal((await setWorkerPhone(g, 'nope', '0501234567')).ok, false); // unknown token
  // collision: a second worker already on 972501234567 → reject
});
```
(Add a collision case with a second seeded worker; confirm `normalizePhone` output format from `phone.ts`.)
- [ ] **Step 3: Run — fail.**
- [ ] **Step 4: Implement** `setWorkerPhone`: read `Workers`, header, `findIndex` by `token`; if not found → `{ok:false,error:'Worker not found'}`. `const p = normalizePhone(newPhone); if (!p) return {ok:false,error:'Phone required'}`. If any OTHER row (`i !== idx`) has `normalizePhone(phone)===p` → `{ok:false,error:'A worker with this phone already exists'}`. Set `newRow[header.indexOf('phone')] = p`; `updateRow(idx+1)`; `{ok:true}`.
- [ ] **Step 5: Export** from `src/index.ts`.
- [ ] **Step 6: Run — pass + typecheck.**
- [ ] **Step 7: Commit.** `git commit -m "feat(core): setWorkerPhone repair-by-token (#0)"`

---

### Task 3: Decouple save from seeding (Fix A wiring, #1 + #3)
**Files:** `packages/web/app/api/admin/shift-assignments/route.ts`, `.../shifts/route.ts`, `.../shifts/copy/route.ts`, `.../shifts/[id]/route.ts`; and the clients that POST to them (surface `seedWarning` as a soft note, not an error).

- [ ] **Step 1: shift-assignments route:** replace the fire-and-forget `generateInstances(gw, today).catch(...)` (after `addRecurring`/`removeRecurring`) with:
```ts
let seedWarning = false;
try { await seedTemplateInstances(gw, templateId, today); }
catch (e) { seedWarning = true; console.error('[shift-assignments] seed failed:', e); }
return Response.json({ ok: true, seedWarning });
```
(Import `seedTemplateInstances`. The recurring add/remove already succeeded above — its success is independent.)
- [ ] **Step 2: addTemplate / copy / shift[id] routes:** each currently does `await <save>; await generateInstances(gw, today); return {ok:true}` inside one try that returns 503 on ANY throw. Wrap ONLY the `generateInstances` call in its own try/catch so a seed failure does NOT fail the save:
```ts
// after the primary save succeeded:
let seedWarning = false;
try { await generateInstances(gw, today); }
catch (e) { seedWarning = true; console.error('[<route>] generateInstances failed after save:', e); }
return Response.json({ ok: true, seedWarning });
```
Keep the primary save inside the outer try (a real save failure still returns its error). Do NOT let a post-save generate throw bubble to the outer catch.
- [ ] **Step 3: Clients:** find the client handlers that POST to these routes (template-detail, the new-shift form, copy, shift-edit). On a response with `ok:true`, treat it as SUCCESS. If `seedWarning` is true, show a soft, non-error note (e.g. a gray toast/line: "Saved. Staffing is syncing — refresh in a moment."). Ensure NONE of them show a red "couldn't save" when `ok:true`. (If a client currently keys success off the HTTP status only, that's fine since we now return 200; the point is to stop the false error from the old 503.)
- [ ] **Step 4:** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build` → pass.
- [ ] **Step 5: Commit.** `git commit -m "fix(web): decouple save success from seeding; targeted reliable seed (#1/#3)"`

---

### Task 4: Refresh after assign/remove (#2)
**Files:** `packages/web/app/admin/shifts/instances/[id]/instance-detail.tsx`.

- [ ] **Step 1:** Read the assign + remove handlers. After a successful POST to `/api/admin/shift-instances/[id]` (action assign/remove), call `router.refresh()` (awaited if the handler is async) so the newly assigned/removed worker chip appears without a manual reload. Mirror the pattern in `templates/[id]/template-detail.tsx` (which already does `router.refresh()`). If there is an optimistic local state update, keep it and still refresh to reconcile.
- [ ] **Step 2:** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build` → pass.
- [ ] **Step 3: Commit.** `git commit -m "fix(web): refresh instance detail after assign/remove (#2)"`

---

### Task 5: Worker phone repair on the list (#0)
**Files:** the workers list route `packages/web/app/admin/workers/fix-phone/route.ts` (create) + the workers list UI (`packages/web/app/admin/page.tsx` and/or its client `workers-filter.tsx` / the list component — find where rows render).

- [ ] **Step 1: Route** `POST /api/admin/workers/fix-phone` — `requireAdmin` (401); body `{ token, phone }`; `const r = await setWorkerPhone(getGateway(), token, phone)`; return `{ ok }` / `{ error }` (400 on `!r.ok`). `runtime='nodejs'`. (Place under `app/api/admin/workers/fix-phone/route.ts`; import depth to `lib`.)
- [ ] **Step 2: List detection:** where the workers list renders rows, compute which rows have a **blank phone** or a phone **shared by >1 worker** (build a phone→count map from the full list). For those rows render an inline **"Fix phone"** control (a small client component): a phone `<input>` + Save button that POSTs `{ token: worker.token, phone }` to the fix-phone route, then `router.refresh()`. The worker's `token` must be available to the row (it's on the `Worker` object; ensure the list passes `token` through — add it to the projected fields if the list trims them). Show the returned error inline on failure.
- [ ] **Step 3:** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build` → pass.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): fix-phone repair for blank/duplicate-phone workers (#0)"`

---

## Self-Review Notes
- **Coverage:** #1→T1/T3 · #2→T4 · #3→T1/T3 · #0→T2/T5.
- **Type consistency:** `seedTemplateInstances` (T1) consumed by T3. `setWorkerPhone` (T2) consumed by T5's route.
- **Ordering:** T1, T2 (core foundations) first. T3 depends on T1. T5 depends on T2. T4 independent.
- **Note:** worker card stays phone-keyed (full re-key deferred); T2/T5 make every worker repairable so phones become unique+non-blank.
