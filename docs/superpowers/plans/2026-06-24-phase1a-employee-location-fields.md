# Phase 1a — Employee & Location Field Extensions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `gender` to employees and six new fields to locations, header-driven in the existing `Workers`/`Places` Sheets tabs, wired through the data layer, admin forms, filters, and lists.

**Architecture:** Purely additive column extensions following the existing Add-Worker / Add-Place pattern. New enum (`GENDER`) in worklog-core; `Worker`/`Place` interfaces, parsers, validators, and column lists extended; admin React forms/filters/lists wired. No new tables, no behavior change.

**Tech Stack:** TypeScript, Next.js 15 App Router (React 19), Google Sheets via `@scourage/sheets-helper`, Node built-in test runner via `tsx`.

## Global Constraints

- worklog-core: ESM with explicit `.ts` import extensions. Tests: `pnpm --filter @scourage/worklog-core test`. Typecheck: `pnpm --filter @scourage/worklog-core typecheck`.
- web: extensionless TS imports. Tests glob only `lib/**/*.test.ts` (pure libs). Verify: `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`.
- Soft-delete reuses the existing `active` column (no new status column).
- Gender values: `male` / `female` / `other` / `''` (blank allowed).
- Location numeric fields (`geofence_radius_m`, `base_rate`) validated numeric only when non-blank; `geofence_radius_m` **defaults to `100` on read** when blank.
- `required_attributes` stored as a comma-separated string; parsed to `string[]` (trim, drop empties) on read.
- Admin-guarded (`requireAdmin`), `runtime='nodejs'`; commit author = OneStromberg (repo-local). LOCAL commits only — no push.
- ponytail: exactly these edits, nothing extra.

---

### Task 1: Employee `gender` — enum, Worker field, validation, filter

**Files:**
- Modify: `packages/worklog-core/src/data/worker-fields.ts`
- Modify: `packages/worklog-core/src/data/workers.ts` (`Worker` + `parseWorker`)
- Modify: `packages/worklog-core/src/data/add-worker.ts` (`AddWorkerInput`, `WORKERS_COLUMNS`, validation, record)
- Modify: `packages/worklog-core/src/index.ts` (export `GENDER`)
- Modify: `packages/web/lib/filter-workers.ts` (`WorkerFilters.gender` + filter)
- Test: `packages/worklog-core/src/data/workers.test.ts`, `packages/worklog-core/src/data/add-worker.test.ts`, `packages/web/lib/filter-workers.test.ts`

**Interfaces:**
- Produces: `GENDER: readonly {value,label}[]`; `Worker.gender: string`; `AddWorkerInput.gender: string`; `WorkerFilters.gender: string[]`.

- [ ] **Step 1: Failing tests.** Append to `packages/worklog-core/src/data/workers.test.ts`:
```ts
test('parseWorker reads gender', () => {
  const w = parseWorker({ phone: '15551230000', name: 'A', places: '', active: 'yes', gender: 'female' }, []);
  assert.equal(w.gender, 'female');
});
```
Append to `packages/worklog-core/src/data/add-worker.test.ts` (reuse its existing `createMemoryGateway` import + Workers header style):
```ts
test('addWorker accepts a valid gender and rejects an invalid one', async () => {
  const g = createMemoryGateway({ Workers: [['phone','name','places','active']] });
  const ok = await addWorker(g, { phone: '15551112222', teudatZeut: '1', name: 'A', places: [], city: '', age: '', transportation: '', hebrewLevel: '', payType: '', payAmount: '', schedule: '', gender: 'male' });
  assert.deepEqual(ok, { ok: true });
  const bad = await addWorker(g, { phone: '15553334444', teudatZeut: '1', name: 'B', places: [], city: '', age: '', transportation: '', hebrewLevel: '', payType: '', payAmount: '', schedule: '', gender: 'zzz' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.errors.gender, 'Invalid');
});
```
Append to `packages/web/lib/filter-workers.test.ts` (reuse its existing helpers; build a minimal filters object matching `WorkerFilters` with `gender: ['female']` and the other arrays empty / `active:'all'` / ages `''`):
```ts
test('filters by gender (OR within, AND across)', () => {
  const base = { search:'', cities:[], transportation:[], hebrewLevel:[], payType:[], schedule:[], places:[], active:'all' as const, ageMin:'', ageMax:'', gender:['female'] };
  const ws = [
    { phone:'1', name:'A', greeting:'', places:[], active:true, teudatZeut:'', gender:'female' },
    { phone:'2', name:'B', greeting:'', places:[], active:true, teudatZeut:'', gender:'male' },
  ] as any;
  assert.deepEqual(filterWorkers(ws, base).map((w:any)=>w.phone), ['1']);
});
```

- [ ] **Step 2: Run — verify fail.** `pnpm --filter @scourage/worklog-core test` and `pnpm --filter @scourage/web test` → FAIL (gender unknown / filter missing).

- [ ] **Step 3: Add the `GENDER` enum** to `packages/worklog-core/src/data/worker-fields.ts` (append):
```ts
export const GENDER = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
] as const;
```

- [ ] **Step 4: `Worker.gender` + parse** in `packages/worklog-core/src/data/workers.ts`:
  Add `gender?: string;` to the `Worker` interface (after `schedule?`), and add to the `parseWorker` return object:
```ts
    gender: (row.gender ?? '').trim(),
```

- [ ] **Step 5: addWorker** in `packages/worklog-core/src/data/add-worker.ts`:
  - Import: add `GENDER` to the existing `worker-fields.ts` import.
  - `AddWorkerInput`: add `gender: string;`.
  - `WORKERS_COLUMNS`: add `'gender'` to the array.
  - Validation (with the other `inEnum` checks): `if (!inEnum(input.gender, GENDER)) errors.gender = 'Invalid';`
  - `record`: add `gender: input.gender,`.

- [ ] **Step 6: export** in `packages/worklog-core/src/index.ts` — add `GENDER` to the `worker-fields.ts` export line.

- [ ] **Step 7: filter** in `packages/web/lib/filter-workers.ts`:
  - `WorkerFilters`: add `gender: string[];`.
  - In `filterWorkers`, after the `schedule` line: `if (!inSet(wk.gender, f.gender)) return false;`

- [ ] **Step 8: Run — verify pass.** `pnpm --filter @scourage/worklog-core test && pnpm --filter @scourage/worklog-core typecheck && pnpm --filter @scourage/web test` → PASS.

- [ ] **Step 9: Commit.**
```bash
git add packages/worklog-core packages/web/lib/filter-workers.ts
git commit -m "feat(core): employee gender field — enum, parse, validation, filter"
```

---

### Task 2: Location fields — client, geofence_radius_m, contact, base_rate, required_attributes, notes

**Files:**
- Modify: `packages/worklog-core/src/data/places.ts` (`Place`, `listPlaces`, `AddPlaceInput`, `addPlace`, `PLACES_COLUMNS`)
- Test: `packages/worklog-core/src/data/places.test.ts`

**Interfaces:**
- Produces: `Place` gains `client, geofenceRadiusM, contact, baseRate, requiredAttributes(string[]), notes`; `AddPlaceInput` gains `client, geofenceRadiusM, contact, baseRate, requiredAttributes(string), notes` (all strings).

- [ ] **Step 1: Failing tests.** Append to `packages/worklog-core/src/data/places.test.ts`:
```ts
test('listPlaces parses new location fields and defaults geofence to 100', async () => {
  const g = createMemoryGateway({
    Places: [
      ['place_name','active','lat','lng','place_id','address','client','geofence_radius_m','contact','base_rate','required_attributes','notes'],
      ['Site A','yes','32','34','x','addr','Acme','','Dan','45','car, male','near gate'],
    ],
  });
  const p = (await listPlaces(g))[0];
  assert.equal(p.client, 'Acme');
  assert.equal(p.geofenceRadiusM, '100');           // blank → default 100
  assert.equal(p.contact, 'Dan');
  assert.equal(p.baseRate, '45');
  assert.deepEqual(p.requiredAttributes, ['car','male']);
  assert.equal(p.notes, 'near gate');
});

test('addPlace stores new fields and rejects non-numeric radius/rate', async () => {
  const g = createMemoryGateway({ Places: [['place_name','active']] });
  const ok = await addPlace(g, { name:'Site B', lat:'1', lng:'2', placeId:'', address:'', client:'Beta', geofenceRadiusM:'150', contact:'Eli', baseRate:'50', requiredAttributes:'car', notes:'gate 2' });
  assert.deepEqual(ok, { ok: true });
  const rows = g.dump().Places; const h = rows[0]; const r = rows[rows.length-1];
  assert.equal(r[h.indexOf('client')], 'Beta');
  assert.equal(r[h.indexOf('geofence_radius_m')], '150');
  assert.equal(r[h.indexOf('required_attributes')], 'car');
  const bad = await addPlace(g, { name:'Site C', lat:'1', lng:'2', placeId:'', address:'', client:'', geofenceRadiusM:'wide', contact:'', baseRate:'', requiredAttributes:'', notes:'' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.errors.geofenceRadiusM, 'Must be a number');
});
```

- [ ] **Step 2: Run — verify fail.** `pnpm --filter @scourage/worklog-core test` → FAIL.

- [ ] **Step 3: Extend `Place` + `listPlaces`** in `packages/worklog-core/src/data/places.ts`.
  `Place` interface — add after `address`:
```ts
  client: string;
  geofenceRadiusM: string;
  contact: string;
  baseRate: string;
  requiredAttributes: string[];
  notes: string;
```
  In `listPlaces`'s `.map`, add to the returned object:
```ts
      client: (o.client ?? '').trim(),
      geofenceRadiusM: (o.geofence_radius_m ?? '').trim() || '100',
      contact: (o.contact ?? '').trim(),
      baseRate: (o.base_rate ?? '').trim(),
      requiredAttributes: (o.required_attributes ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      notes: (o.notes ?? '').trim(),
```

- [ ] **Step 4: Extend `AddPlaceInput`, `PLACES_COLUMNS`, `addPlace`.**
  `AddPlaceInput` — add: `client: string; geofenceRadiusM: string; contact: string; baseRate: string; requiredAttributes: string; notes: string;`.
  `PLACES_COLUMNS` — append: `'client', 'geofence_radius_m', 'contact', 'base_rate', 'required_attributes', 'notes'`.
  In `addPlace`, after the existing numeric checks for lat/lng, add:
```ts
  if (input.geofenceRadiusM.trim() && !numeric(input.geofenceRadiusM)) errors.geofenceRadiusM = 'Must be a number';
  if (input.baseRate.trim() && !numeric(input.baseRate)) errors.baseRate = 'Must be a number';
```
  In the `record` object, add:
```ts
    client: input.client.trim(),
    geofence_radius_m: input.geofenceRadiusM.trim(),
    contact: input.contact.trim(),
    base_rate: input.baseRate.trim(),
    required_attributes: input.requiredAttributes.trim(),
    notes: input.notes.trim(),
```

- [ ] **Step 5: Run — verify pass.** `pnpm --filter @scourage/worklog-core test && pnpm --filter @scourage/worklog-core typecheck` → PASS.

- [ ] **Step 6: Commit.**
```bash
git add packages/worklog-core/src/data/places.ts packages/worklog-core/src/data/places.test.ts
git commit -m "feat(core): location fields — client, geofence radius, contact, base rate, required attributes, notes"
```

---

### Task 3: Wire `gender` into the admin worker form + filter UI

**Files:**
- Modify: `packages/web/app/admin/add/add-worker-form.tsx`
- Modify: `packages/web/app/admin/add/page.tsx` (pass `GENDER`)
- Modify: `packages/web/app/admin/page.tsx` (pass `GENDER`)
- Modify: `packages/web/app/admin/workers-filter.tsx` (gender chips + filter state)

**Interfaces:**
- Consumes: `GENDER` from `@scourage/worklog-core`; `WorkerFilters.gender` from `lib/filter-workers`.

- [ ] **Step 1: add-worker form gender select.** In `packages/web/app/admin/add/add-worker-form.tsx`:
  - Add `gender: ''` to `FIELDS0`.
  - Extend the `Props.enums` type to include `gender: EnumOpt`.
  - Render a gender select (near city/age): `{select('gender', 'Gender', enums.gender)}`.

- [ ] **Step 2: pass GENDER to the add form.** In `packages/web/app/admin/add/page.tsx`:
  - Import: add `GENDER` to the `@scourage/worklog-core` import.
  - In the `<AddWorkerForm enums={{ ... }}>` prop, add `gender: GENDER`.

- [ ] **Step 3: pass GENDER to the filter.** In `packages/web/app/admin/page.tsx`:
  - Import: add `GENDER`.
  - In `<WorkersFilter enums={{ ... }}>`, add `gender: GENDER`.

- [ ] **Step 4: gender chips in the filter.** In `packages/web/app/admin/workers-filter.tsx`:
  - Extend the `enums` prop type with `gender: EnumOpt`.
  - Add `gender: []` to the initial `WorkerFilters` state object.
  - Render a gender chip group mirroring the existing transportation/schedule chip groups, toggling `filters.gender`.

- [ ] **Step 5: Verify.** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build` → PASS.

- [ ] **Step 6: Commit.**
```bash
git add packages/web/app/admin
git commit -m "feat(web): gender in admin add-worker form and filter"
```

---

### Task 4: Wire new location fields into the add-place form, route, and list

**Files:**
- Modify: `packages/web/app/admin/places/add/add-place-form.tsx` (optional inputs + POST body)
- Modify: `packages/web/app/api/admin/places/route.ts` (coerce new fields)
- Modify: `packages/web/app/admin/places/page.tsx` (client column)

**Interfaces:**
- Consumes: `AddPlaceInput` (now with the 6 new string fields) from `@scourage/worklog-core`.

- [ ] **Step 1: add-place form optional inputs.** In `packages/web/app/admin/places/add/add-place-form.tsx`:
  - Add local state for the six fields: `const [extra, setExtra] = useState({ client:'', contact:'', baseRate:'', geofenceRadiusM:'100', requiredAttributes:'', notes:'' });`
  - After the selected-place confirmation block, render labeled text inputs bound to `extra` (client, contact, base_rate, geofence_radius_m, required_attributes, notes). Reuse the existing input styling.
  - In `save()`, merge into the POST body: `body: JSON.stringify({ ...sel, ...extra })`.

- [ ] **Step 2: route coercion.** In `packages/web/app/api/admin/places/route.ts`, extend the `input` object with:
```ts
    client: str(b.client), geofenceRadiusM: str(b.geofenceRadiusM), contact: str(b.contact),
    baseRate: str(b.baseRate), requiredAttributes: str(b.requiredAttributes), notes: str(b.notes),
```

- [ ] **Step 3: list client column.** In `packages/web/app/admin/places/page.tsx`, add a `Client` column header and `<td>{p.client || '—'}</td>` to each row (before Address).

- [ ] **Step 4: Verify.** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add packages/web/app/admin/places packages/web/app/api/admin/places
git commit -m "feat(web): location fields in add-place form, route, and list"
```

---

## Self-Review Notes
- **Spec coverage:** gender (T1), soft-delete reuses existing `active` (no code — lists already honor it; show-inactive toggle already exists via the `active` filter select), location fields incl. geofence default-100 + required_attributes split (T2), forms/filter/list wiring (T3, T4). Validation + tests per task.
- **Type consistency:** `AddPlaceInput` string fields (incl. `requiredAttributes` as comma string) match the route coercion and form body; `Place.requiredAttributes` is `string[]` (read-side only). `GENDER` named identically in core, forms, and filter.
- **No new deps, no new tables.**
