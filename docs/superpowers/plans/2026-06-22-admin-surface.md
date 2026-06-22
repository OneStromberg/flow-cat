# FlowCat Admin Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin area (`/admin`) for workers flagged `admin`: add new workers (rich profile) and browse all workers with complex multi-field filtering.

**Architecture:** `worklog-core` gains the admin/profile fields on `Worker`, enum option lists, `listWorkers`, and `addWorker` (validate + header-driven Workers append). The Next.js `web` app gains a `requireAdmin` guard, role-based `/` routing, a pure `filterWorkers`, an `/admin` list page with a client filter panel, and an `/admin/add` form + admin-only create route. Google Sheets stays the database.

**Tech Stack:** Next.js 15 App Router + React 19, TypeScript, `googleapis`, Node built-in test runner via `tsx`. Deployed on Vercel.

## Global Constraints

- Node ≥ 22, ESM. `worklog-core` uses explicit `.ts` import extensions; `web` uses bare workspace specifiers + Next resolution.
- pnpm only. Packages: `@scourage/sheets-helper`, `@scourage/worklog-core`, `@scourage/web`.
- New `Worker` admin/profile fields are **optional** in the type (always set by the parser; optional avoids breaking existing `Worker` literals in tests).
- Canonical enum values: transportation `nothing|car|electric_bicycle`; hebrew_level `read_write|speaks_good|mid|badly|none`; pay_type `full|amount|none`; schedule `days|nights|all`.
- Filtering: **AND across fields, OR (multi-select) within each enum**, age min–max, name/phone search; **instant in-browser** (pure function).
- `requireAdmin` guards every `/admin*` page (redirect non-admins to `/`) and the create route (401). `runtime='nodejs'` on admin pages/routes.
- Teudat zeut never logged/echoed beyond the form round-trip.
- Local commits only — **NEVER run `git push`**. **ponytail:** exactly the brief; no new deps.

---

### Task 1: worklog-core — Worker profile fields, enums, listWorkers

**Files:**
- Modify: `packages/worklog-core/src/data/workers.ts`
- Create: `packages/worklog-core/src/data/worker-fields.ts`
- Test: `packages/worklog-core/src/data/workers.test.ts` (add cases)
- Modify: `packages/worklog-core/src/index.ts`

**Interfaces:**
- Produces:
  - `Worker` gains optional `admin?: boolean; city?: string; transportation?: string; age?: string; hebrewLevel?: string; payType?: string; payAmount?: string; schedule?: string`.
  - `worker-fields.ts`: `TRANSPORTATION`, `HEBREW_LEVEL`, `PAY_TYPE`, `SCHEDULE` — each `readonly { value: string; label: string }[]`.
  - `listWorkers(gateway): Promise<Worker[]>` — all Workers rows (those with a non-empty phone) as `Worker[]`, master Places loaded once.

- [ ] **Step 1: Create `packages/worklog-core/src/data/worker-fields.ts`**

```ts
export const TRANSPORTATION = [
  { value: 'nothing', label: 'Nothing' },
  { value: 'car', label: 'Car' },
  { value: 'electric_bicycle', label: 'Electric bicycle' },
] as const;

export const HEBREW_LEVEL = [
  { value: 'read_write', label: 'Read & write' },
  { value: 'speaks_good', label: 'Speaks good' },
  { value: 'mid', label: 'Mid speaking level' },
  { value: 'badly', label: 'Speaks badly' },
  { value: 'none', label: "Doesn't know Hebrew" },
] as const;

export const PAY_TYPE = [
  { value: 'full', label: 'Full salary' },
  { value: 'amount', label: 'Specific amount' },
  { value: 'none', label: "Can't receive money" },
] as const;

export const SCHEDULE = [
  { value: 'days', label: 'Days' },
  { value: 'nights', label: 'Nights' },
  { value: 'all', label: 'All' },
] as const;
```

- [ ] **Step 2: Write the failing test — append to `packages/worklog-core/src/data/workers.test.ts`**

```ts
import { listWorkers } from './workers.ts';

test('parses admin + profile fields and lists all workers', async () => {
  const g = createMemoryGateway({
    Places: [['place_name', 'active'], ['Warehouse', 'yes']],
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active', 'teudat_zeut', 'admin', 'city', 'age', 'transportation', 'hebrew_level', 'pay_type', 'pay_amount', 'schedule'],
      ['15551230000', 'Boss', '', 'Warehouse', 'yes', '111', 'yes', 'Tel Aviv', '40', 'car', 'read_write', 'full', '', 'all'],
      ['15559990000', 'Dan', '', 'Warehouse', 'yes', '222', '', 'Haifa', '25', 'electric_bicycle', 'mid', 'amount', '4500', 'nights'],
    ],
  });
  const all = await listWorkers(g);
  assert.equal(all.length, 2);
  const boss = all.find((w) => w.name === 'Boss')!;
  assert.equal(boss.admin, true);
  assert.equal(boss.city, 'Tel Aviv');
  assert.equal(boss.transportation, 'car');
  assert.equal(boss.schedule, 'all');
  const dan = all.find((w) => w.name === 'Dan')!;
  assert.equal(dan.admin, false);
  assert.equal(dan.payType, 'amount');
  assert.equal(dan.payAmount, '4500');
});
```

- [ ] **Step 3: Run — verify fail**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: FAIL — `listWorkers` not exported; profile fields undefined.

- [ ] **Step 4: Rewrite `packages/worklog-core/src/data/workers.ts`**

```ts
import { rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import { normalizePhone } from './phone.ts';
import { loadActivePlaces } from './places.ts';

export interface Worker {
  phone: string;
  name: string;
  greeting: string;
  places: string[];
  active: boolean;
  token?: string;
  teudatZeut: string;
  admin?: boolean;
  city?: string;
  transportation?: string;
  age?: string;
  hebrewLevel?: string;
  payType?: string;
  payAmount?: string;
  schedule?: string;
}

/** Pure: build a Worker from a sheet row, filtering places against a pre-loaded master list. */
export function parseWorker(row: Record<string, string>, master: string[]): Worker {
  const workerPlaces = (row.places ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const masterLower = master.map((m) => m.toLowerCase());
  const places = master.length === 0
    ? workerPlaces
    : workerPlaces.filter((p) => masterLower.includes(p.toLowerCase()));
  return {
    phone: normalizePhone(row.phone ?? ''),
    name: (row.name ?? '').trim(),
    greeting: (row.greeting ?? '').trim(),
    places,
    active: (row.active ?? '').trim().toLowerCase() !== 'no',
    token: (row.token ?? '').trim(),
    teudatZeut: (row.teudat_zeut ?? '').trim(),
    admin: (row.admin ?? '').trim().toLowerCase() === 'yes',
    city: (row.city ?? '').trim(),
    transportation: (row.transportation ?? '').trim(),
    age: (row.age ?? '').trim(),
    hebrewLevel: (row.hebrew_level ?? '').trim(),
    payType: (row.pay_type ?? '').trim(),
    payAmount: (row.pay_amount ?? '').trim(),
    schedule: (row.schedule ?? '').trim(),
  };
}

async function buildWorker(gateway: SheetsGateway, row: Record<string, string>): Promise<Worker> {
  const master = await loadActivePlaces(gateway);
  return parseWorker(row, master);
}

export async function findWorker(gateway: SheetsGateway, phone: string): Promise<Worker | null> {
  const target = normalizePhone(phone);
  const objs = rowsToObjects(await gateway.readTab('Workers'));
  const row = objs.find((o) => normalizePhone(o.phone ?? '') === target);
  return row ? buildWorker(gateway, row) : null;
}

export async function findWorkerByToken(gateway: SheetsGateway, token: string): Promise<Worker | null> {
  const t = (token ?? '').trim();
  if (!t) return null;
  const objs = rowsToObjects(await gateway.readTab('Workers'));
  const row = objs.find((o) => (o.token ?? '').trim() === t);
  return row ? buildWorker(gateway, row) : null;
}

export async function authenticateWorker(
  gateway: SheetsGateway,
  phone: string,
  teudatZeut: string,
): Promise<Worker | null> {
  const worker = await findWorker(gateway, phone);
  if (!worker || !worker.active) return null;
  if (worker.teudatZeut === '' || worker.teudatZeut !== teudatZeut.trim()) return null;
  return worker;
}

export async function listWorkers(gateway: SheetsGateway): Promise<Worker[]> {
  const master = await loadActivePlaces(gateway);
  const objs = rowsToObjects(await gateway.readTab('Workers'));
  return objs.filter((o) => (o.phone ?? '').trim() !== '').map((o) => parseWorker(o, master));
}
```
(Note: the previous per-place `console.warn` is dropped — filtering still happens silently; existing tests assert the filtered `places`, not the warning, so they pass.)

- [ ] **Step 5: Update `packages/worklog-core/src/index.ts`** — add:

```ts
export { listWorkers } from './data/workers.ts';
export { TRANSPORTATION, HEBREW_LEVEL, PAY_TYPE, SCHEDULE } from './data/worker-fields.ts';
```

- [ ] **Step 6: Run worklog-core + whatsapp-bot + web tests/typecheck**

Run:
```bash
pnpm --filter @scourage/worklog-core test && pnpm --filter @scourage/worklog-core typecheck
pnpm --filter @scourage/whatsapp-bot test && pnpm --filter @scourage/whatsapp-bot typecheck
pnpm --filter @scourage/web typecheck
```
Expected: all PASS (the new `Worker` fields are optional → no literal breakage).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(worklog-core): worker admin/profile fields + enums + listWorkers"
```

---

### Task 2: worklog-core — addWorker (validate + append)

**Files:**
- Create: `packages/worklog-core/src/data/add-worker.ts`
- Test: `packages/worklog-core/src/data/add-worker.test.ts`
- Modify: `packages/worklog-core/src/index.ts`

**Interfaces:**
- Consumes: `SheetsGateway`, `rowsToObjects`, `objectToRow`, `normalizePhone`, the enum lists.
- Produces:
  - `interface AddWorkerInput { phone: string; teudatZeut: string; name: string; places: string[]; city: string; age: string; transportation: string; hebrewLevel: string; payType: string; payAmount: string; schedule: string; }`
  - `addWorker(gateway, input: AddWorkerInput): Promise<{ ok: true } | { ok: false; errors: Record<string,string> }>`.

- [ ] **Step 1: Write the failing test — `packages/worklog-core/src/data/add-worker.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { addWorker } from './add-worker.ts';

const base = {
  phone: '+1 555-222-0000', teudatZeut: '987654321', name: 'New Guy',
  places: ['Warehouse'], city: 'Eilat', age: '30',
  transportation: 'car', hebrewLevel: 'speaks_good', payType: 'full', payAmount: '', schedule: 'days',
};

test('adds a valid worker (header-aligned row, active=yes)', async () => {
  const g = createMemoryGateway({ Workers: [['phone', 'name', 'active']] });
  const r = await addWorker(g, base);
  assert.deepEqual(r, { ok: true });
  const rows = g.dump().Workers;
  const header = rows[0];
  const row = rows[1];
  const get = (k: string) => row[header.indexOf(k)];
  assert.equal(get('phone'), '15552220000');
  assert.equal(get('name'), 'New Guy');
  assert.equal(get('active'), 'yes');
  assert.equal(get('teudat_zeut'), '987654321');
  assert.equal(get('transportation'), 'car');
  assert.equal(get('schedule'), 'days');
});

test('flags required-missing, bad enum, non-numeric age', async () => {
  const g = createMemoryGateway({ Workers: [['phone', 'name']] });
  const r = await addWorker(g, { ...base, phone: '', name: '', transportation: 'plane', age: 'old' });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.phone && r.errors.name && r.errors.transportation && r.errors.age);
  }
});

test('requires pay_amount only when pay_type=amount', async () => {
  const g = createMemoryGateway({ Workers: [['phone', 'name']] });
  const bad = await addWorker(g, { ...base, payType: 'amount', payAmount: '' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.errors.payAmount);
  const ok = await addWorker(g, { ...base, phone: '15553330000', payType: 'amount', payAmount: '5000' });
  assert.deepEqual(ok, { ok: true });
});

test('rejects a duplicate phone', async () => {
  const g = createMemoryGateway({ Workers: [['phone', 'name'], ['15552220000', 'Existing']] });
  const r = await addWorker(g, base); // base phone normalizes to 15552220000
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errors.phone, /already exists/);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: FAIL — cannot find `./add-worker.ts`.

- [ ] **Step 3: Implement `packages/worklog-core/src/data/add-worker.ts`**

```ts
import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import { normalizePhone } from './phone.ts';
import { TRANSPORTATION, HEBREW_LEVEL, PAY_TYPE, SCHEDULE } from './worker-fields.ts';

export interface AddWorkerInput {
  phone: string;
  teudatZeut: string;
  name: string;
  places: string[];
  city: string;
  age: string;
  transportation: string;
  hebrewLevel: string;
  payType: string;
  payAmount: string;
  schedule: string;
}

const WORKERS_COLUMNS = [
  'phone', 'name', 'greeting', 'places', 'active', 'token', 'teudat_zeut',
  'admin', 'city', 'age', 'transportation', 'hebrew_level', 'pay_type', 'pay_amount', 'schedule',
];

function inEnum(val: string, list: readonly { value: string }[]): boolean {
  return val === '' || list.some((o) => o.value === val);
}

export async function addWorker(
  gateway: SheetsGateway,
  input: AddWorkerInput,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  const errors: Record<string, string> = {};
  const phone = normalizePhone(input.phone);

  if (!phone) errors.phone = 'Required';
  if (!input.teudatZeut.trim()) errors.teudatZeut = 'Required';
  if (!input.name.trim()) errors.name = 'Required';
  if (input.age.trim() && !Number.isFinite(Number(input.age))) errors.age = 'Must be a number';
  if (!inEnum(input.transportation, TRANSPORTATION)) errors.transportation = 'Invalid';
  if (!inEnum(input.hebrewLevel, HEBREW_LEVEL)) errors.hebrewLevel = 'Invalid';
  if (!inEnum(input.payType, PAY_TYPE)) errors.payType = 'Invalid';
  if (!inEnum(input.schedule, SCHEDULE)) errors.schedule = 'Invalid';
  if (input.payType === 'amount' && (!input.payAmount.trim() || !Number.isFinite(Number(input.payAmount)))) {
    errors.payAmount = 'Enter an amount';
  }

  if (phone && !errors.phone) {
    const objs = rowsToObjects(await gateway.readTab('Workers'));
    if (objs.some((o) => normalizePhone(o.phone ?? '') === phone)) {
      errors.phone = 'A worker with this phone already exists';
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const record: Record<string, string> = {
    phone,
    name: input.name.trim(),
    greeting: '',
    places: input.places.join(', '),
    active: 'yes',
    token: '',
    teudat_zeut: input.teudatZeut.trim(),
    admin: '',
    city: input.city.trim(),
    age: input.age.trim(),
    transportation: input.transportation,
    hebrew_level: input.hebrewLevel,
    pay_type: input.payType,
    pay_amount: input.payType === 'amount' ? input.payAmount.trim() : '',
    schedule: input.schedule,
  };

  const rows = await gateway.readTab('Workers');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];
  const header = [...existing];
  for (const col of WORKERS_COLUMNS) if (!header.includes(col)) header.push(col);
  if (existing.length === 0 || header.length !== existing.length) {
    await gateway.writeHeaderRow('Workers', header);
  }
  await gateway.appendRow('Workers', objectToRow(record, header));
  return { ok: true };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: PASS.

- [ ] **Step 5: Update `packages/worklog-core/src/index.ts`** — add:

```ts
export { addWorker, type AddWorkerInput } from './data/add-worker.ts';
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @scourage/worklog-core typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(worklog-core): addWorker (validation + header-aligned append)"
```

---

### Task 3: web — requireAdmin + role-based landing

**Files:**
- Modify: `packages/web/lib/session.ts` (add `requireAdmin`)
- Modify: `packages/web/app/page.tsx` (role routing)
- Modify: `packages/web/app/login/login-form.tsx` (redirect to `/`)

**Interfaces:**
- Consumes: `requireWorker`, `Worker` (worklog-core).
- Produces: `requireAdmin(): Promise<Worker | null>` (server-only).

- [ ] **Step 1: Add `requireAdmin` to `packages/web/lib/session.ts`**

Append (after `requireWorker`):
```ts
export async function requireAdmin(): Promise<Worker | null> {
  const worker = await requireWorker();
  if (!worker || !worker.active || worker.admin !== true) return null;
  return worker;
}
```

- [ ] **Step 2: Rewrite `packages/web/app/page.tsx` for role routing**

```tsx
import { redirect } from 'next/navigation';
import { requireWorker } from '../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Home() {
  const worker = await requireWorker();
  if (!worker) redirect('/login');
  redirect(worker.admin ? '/admin' : '/app');
}
```

- [ ] **Step 3: Update the login redirect — `packages/web/app/login/login-form.tsx`**

Change the two post-login navigations from `'/app'` to `'/'` (the `/` page routes by role). I.e. replace `router.replace('/app')` with `router.replace('/')` (there is one occurrence in the success branch).

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`
Expected: PASS. (`/admin` doesn't exist yet — it's added in Task 5; `/` redirecting to it compiles fine since the redirect target is a string.)

- [ ] **Step 5: Commit**

```bash
git add packages/web/lib/session.ts packages/web/app/page.tsx packages/web/app/login/login-form.tsx
git commit -m "feat(web): requireAdmin + role-based / routing"
```

---

### Task 4: web — pure filterWorkers

**Files:**
- Create: `packages/web/lib/filter-workers.ts`
- Test: `packages/web/lib/filter-workers.test.ts`

**Interfaces:**
- Consumes: `Worker` (worklog-core).
- Produces:
  - `interface WorkerFilters { search: string; cities: string[]; transportation: string[]; hebrewLevel: string[]; payType: string[]; schedule: string[]; places: string[]; active: 'all' | 'yes' | 'no'; ageMin: string; ageMax: string; }`
  - `filterWorkers(workers: Worker[], f: WorkerFilters): Worker[]`.

- [ ] **Step 1: Write the failing test — `packages/web/lib/filter-workers.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterWorkers, type WorkerFilters } from './filter-workers.ts';
import type { Worker } from '@scourage/worklog-core';

const w = (o: Partial<Worker>): Worker => ({
  phone: '1', name: 'X', greeting: '', places: [], active: true, teudatZeut: '',
  admin: false, city: '', transportation: '', age: '', hebrewLevel: '', payType: '', payAmount: '', schedule: '', ...o,
});
const workers: Worker[] = [
  w({ name: 'Boss', phone: '15551230000', city: 'Tel Aviv', transportation: 'car', age: '40', places: ['Warehouse'], schedule: 'all' }),
  w({ name: 'Dan', phone: '15559990000', city: 'Haifa', transportation: 'electric_bicycle', age: '25', places: ['Office'], schedule: 'nights' }),
  w({ name: 'Eve', phone: '15558880000', city: 'Haifa', transportation: 'nothing', age: '60', places: ['Warehouse', 'Office'], active: false, schedule: 'days' }),
];
const empty: WorkerFilters = { search: '', cities: [], transportation: [], hebrewLevel: [], payType: [], schedule: [], places: [], active: 'all', ageMin: '', ageMax: '' };

test('empty filters return everyone', () => {
  assert.equal(filterWorkers(workers, empty).length, 3);
});
test('search matches name or phone (substring, case-insensitive)', () => {
  assert.deepEqual(filterWorkers(workers, { ...empty, search: 'bos' }).map((x) => x.name), ['Boss']);
  assert.deepEqual(filterWorkers(workers, { ...empty, search: '9990' }).map((x) => x.name), ['Dan']);
});
test('OR within a field, AND across fields', () => {
  // transport car OR nothing → Boss, Eve; AND city Haifa → Eve
  assert.deepEqual(filterWorkers(workers, { ...empty, transportation: ['car', 'nothing'], cities: ['Haifa'] }).map((x) => x.name), ['Eve']);
});
test('places matches any selected place', () => {
  assert.deepEqual(filterWorkers(workers, { ...empty, places: ['Office'] }).map((x) => x.name).sort(), ['Dan', 'Eve']);
});
test('active filter and age range', () => {
  assert.deepEqual(filterWorkers(workers, { ...empty, active: 'no' }).map((x) => x.name), ['Eve']);
  assert.deepEqual(filterWorkers(workers, { ...empty, ageMin: '30', ageMax: '50' }).map((x) => x.name), ['Boss']);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter @scourage/web test`
Expected: FAIL — cannot find `./filter-workers.ts`.

- [ ] **Step 3: Implement `packages/web/lib/filter-workers.ts`**

```ts
import type { Worker } from '@scourage/worklog-core';

export interface WorkerFilters {
  search: string;
  cities: string[];
  transportation: string[];
  hebrewLevel: string[];
  payType: string[];
  schedule: string[];
  places: string[];
  active: 'all' | 'yes' | 'no';
  ageMin: string;
  ageMax: string;
}

const inSet = (val: string | undefined, set: string[]): boolean => set.length === 0 || set.includes(val ?? '');

export function filterWorkers(workers: Worker[], f: WorkerFilters): Worker[] {
  const search = f.search.trim().toLowerCase();
  return workers.filter((wk) => {
    if (search && !`${wk.name} ${wk.phone}`.toLowerCase().includes(search)) return false;
    if (!inSet(wk.city, f.cities)) return false;
    if (!inSet(wk.transportation, f.transportation)) return false;
    if (!inSet(wk.hebrewLevel, f.hebrewLevel)) return false;
    if (!inSet(wk.payType, f.payType)) return false;
    if (!inSet(wk.schedule, f.schedule)) return false;
    if (f.places.length > 0 && !wk.places.some((p) => f.places.includes(p))) return false;
    if (f.active === 'yes' && !wk.active) return false;
    if (f.active === 'no' && wk.active) return false;
    if (f.ageMin.trim() || f.ageMax.trim()) {
      const age = Number(wk.age);
      if (!Number.isFinite(age) || (wk.age ?? '').trim() === '') return false;
      if (f.ageMin.trim() && age < Number(f.ageMin)) return false;
      if (f.ageMax.trim() && age > Number(f.ageMax)) return false;
    }
    return true;
  });
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm --filter @scourage/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/lib/filter-workers.ts packages/web/lib/filter-workers.test.ts
git commit -m "feat(web): pure filterWorkers (AND across fields, OR within)"
```

---

### Task 5: web — `/admin` list + filter panel

**Files:**
- Create: `packages/web/app/admin/page.tsx`
- Create: `packages/web/app/admin/workers-filter.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (lib/session); `getGateway` (lib/sheets); `listWorkers`, `TRANSPORTATION`, `HEBREW_LEVEL`, `PAY_TYPE`, `SCHEDULE`, `type Worker` (worklog-core); `filterWorkers`, `type WorkerFilters` (lib/filter-workers).
- Produces: the admin list page.

- [ ] **Step 1: Create the server page `packages/web/app/admin/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { requireAdmin } from '../../lib/session';
import { getGateway } from '../../lib/sheets';
import { listWorkers, TRANSPORTATION, HEBREW_LEVEL, PAY_TYPE, SCHEDULE } from '@scourage/worklog-core';
import { WorkersFilter } from './workers-filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  const workers = await listWorkers(getGateway());
  const cities = [...new Set(workers.map((w) => w.city ?? '').filter(Boolean))].sort();
  const places = [...new Set(workers.flatMap((w) => w.places))].sort();

  return (
    <main className="mx-auto max-w-4xl p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Workers</h1>
        <a href="/admin/add" className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white">+ Add worker</a>
      </div>
      <WorkersFilter
        workers={workers}
        cities={cities}
        places={places}
        enums={{ transportation: TRANSPORTATION, hebrewLevel: HEBREW_LEVEL, payType: PAY_TYPE, schedule: SCHEDULE }}
      />
    </main>
  );
}
```

- [ ] **Step 2: Create the client filter `packages/web/app/admin/workers-filter.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import type { Worker } from '@scourage/worklog-core';
import { filterWorkers, type WorkerFilters } from '../../lib/filter-workers';

type EnumOpt = readonly { value: string; label: string }[];
type Props = {
  workers: Worker[];
  cities: string[];
  places: string[];
  enums: { transportation: EnumOpt; hebrewLevel: EnumOpt; payType: EnumOpt; schedule: EnumOpt };
};

const EMPTY: WorkerFilters = {
  search: '', cities: [], transportation: [], hebrewLevel: [], payType: [], schedule: [], places: [], active: 'all', ageMin: '', ageMax: '',
};

function Chips({ label, options, selected, onToggle }: { label: string; options: { value: string; label: string }[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o.value} type="button" onClick={() => onToggle(o.value)}
            className={`rounded-full border px-2.5 py-1 text-xs ${selected.includes(o.value) ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WorkersFilter({ workers, cities, places, enums }: Props) {
  const [f, setF] = useState<WorkerFilters>(EMPTY);
  const toggle = (key: keyof WorkerFilters, v: string) =>
    setF((prev) => {
      const arr = prev[key] as string[];
      return { ...prev, [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });

  const shown = useMemo(() => filterWorkers(workers, f), [workers, f]);
  const cityOpts = cities.map((c) => ({ value: c, label: c }));
  const placeOpts = places.map((p) => ({ value: p, label: p }));

  return (
    <div className="mt-4">
      <div className="space-y-3 rounded-lg border border-gray-200 p-4">
        <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Search name or phone…"
          value={f.search} onChange={(e) => setF((p) => ({ ...p, search: e.target.value }))} />
        <Chips label="Transportation" options={[...enums.transportation]} selected={f.transportation} onToggle={(v) => toggle('transportation', v)} />
        <Chips label="Hebrew level" options={[...enums.hebrewLevel]} selected={f.hebrewLevel} onToggle={(v) => toggle('hebrewLevel', v)} />
        <Chips label="Pay" options={[...enums.payType]} selected={f.payType} onToggle={(v) => toggle('payType', v)} />
        <Chips label="Schedule" options={[...enums.schedule]} selected={f.schedule} onToggle={(v) => toggle('schedule', v)} />
        {cityOpts.length > 0 && <Chips label="City" options={cityOpts} selected={f.cities} onToggle={(v) => toggle('cities', v)} />}
        {placeOpts.length > 0 && <Chips label="Places" options={placeOpts} selected={f.places} onToggle={(v) => toggle('places', v)} />}
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Age
            <div className="mt-1 flex items-center gap-1">
              <input className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm" type="number" placeholder="min" value={f.ageMin} onChange={(e) => setF((p) => ({ ...p, ageMin: e.target.value }))} />
              <span>–</span>
              <input className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm" type="number" placeholder="max" value={f.ageMax} onChange={(e) => setF((p) => ({ ...p, ageMax: e.target.value }))} />
            </div>
          </label>
          <label className="text-sm">Active
            <select className="mt-1 block rounded-lg border border-gray-300 px-2 py-1 text-sm" value={f.active} onChange={(e) => setF((p) => ({ ...p, active: e.target.value as WorkerFilters['active'] }))}>
              <option value="all">All</option><option value="yes">Active</option><option value="no">Inactive</option>
            </select>
          </label>
          <button type="button" className="ml-auto text-sm text-gray-500 underline" onClick={() => setF(EMPTY)}>Clear</button>
        </div>
      </div>

      <p className="mt-3 text-sm text-gray-500">{shown.length} of {workers.length} shown</p>
      <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr><th className="p-2">Name</th><th className="p-2">Phone</th><th className="p-2">City</th><th className="p-2">Age</th><th className="p-2">Transport</th><th className="p-2">Schedule</th><th className="p-2">Active</th></tr>
          </thead>
          <tbody>
            {shown.map((wk) => (
              <tr key={wk.phone} className="border-t border-gray-100">
                <td className="p-2 font-medium">{wk.name}{wk.admin ? ' ★' : ''}</td>
                <td className="p-2">{wk.phone}</td>
                <td className="p-2">{wk.city}</td>
                <td className="p-2">{wk.age}</td>
                <td className="p-2">{wk.transportation}</td>
                <td className="p-2">{wk.schedule}</td>
                <td className="p-2">{wk.active ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/admin/page.tsx packages/web/app/admin/workers-filter.tsx
git commit -m "feat(web): /admin worker list + filter panel"
```

---

### Task 6: web — `/admin/add` form + create route

**Files:**
- Create: `packages/web/app/admin/add/page.tsx`
- Create: `packages/web/app/admin/add/add-worker-form.tsx`
- Create: `packages/web/app/api/admin/workers/route.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `getGateway`; `addWorker`, `loadActivePlaces`, `TRANSPORTATION`, `HEBREW_LEVEL`, `PAY_TYPE`, `SCHEDULE` (worklog-core).
- Produces: the add-worker page + admin-only `POST /api/admin/workers`.

- [ ] **Step 1: Create `packages/web/app/api/admin/workers/route.ts`**

```ts
import { getGateway } from '../../../../lib/sheets';
import { requireAdmin } from '../../../../lib/session';
import { addWorker, type AddWorkerInput } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const input: AddWorkerInput = {
    phone: str(b.phone), teudatZeut: str(b.teudatZeut), name: str(b.name),
    places: Array.isArray(b.places) ? (b.places as unknown[]).map(str).filter(Boolean) : [],
    city: str(b.city), age: str(b.age),
    transportation: str(b.transportation), hebrewLevel: str(b.hebrewLevel),
    payType: str(b.payType), payAmount: str(b.payAmount), schedule: str(b.schedule),
  };

  try {
    const r = await addWorker(getGateway(), input);
    if (!r.ok) return Response.json({ errors: r.errors }, { status: 400 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('add worker failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
```

- [ ] **Step 2: Create `packages/web/app/admin/add/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getGateway } from '../../../lib/sheets';
import { loadActivePlaces, TRANSPORTATION, HEBREW_LEVEL, PAY_TYPE, SCHEDULE } from '@scourage/worklog-core';
import { AddWorkerForm } from './add-worker-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AddWorkerPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/');
  const places = await loadActivePlaces(getGateway());
  return (
    <main className="mx-auto max-w-md p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Add worker</h1>
        <a href="/admin" className="text-sm text-gray-500 underline">Back</a>
      </div>
      <AddWorkerForm
        places={places}
        enums={{ transportation: TRANSPORTATION, hebrewLevel: HEBREW_LEVEL, payType: PAY_TYPE, schedule: SCHEDULE }}
      />
    </main>
  );
}
```

- [ ] **Step 3: Create `packages/web/app/admin/add/add-worker-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type EnumOpt = readonly { value: string; label: string }[];
type Props = { places: string[]; enums: { transportation: EnumOpt; hebrewLevel: EnumOpt; payType: EnumOpt; schedule: EnumOpt } };

const FIELDS0 = {
  phone: '', teudatZeut: '', name: '', city: '', age: '',
  transportation: '', hebrewLevel: '', payType: '', payAmount: '', schedule: '',
};

export function AddWorkerForm({ places, enums }: Props) {
  const router = useRouter();
  const [v, setV] = useState({ ...FIELDS0 });
  const [selPlaces, setSelPlaces] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof FIELDS0, val: string) => setV((p) => ({ ...p, [k]: val }));
  const togglePlace = (p: string) => setSelPlaces((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFatal(null);
    try {
      const res = await fetch('/api/admin/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, places: selPlaces }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        router.replace('/admin');
        router.refresh();
      } else if (res.status === 400 && data.errors) {
        setErrors(data.errors);
        setBusy(false);
      } else {
        setFatal('Could not save. Please try again.');
        setBusy(false);
      }
    } catch {
      setFatal('Network error. Please try again.');
      setBusy(false);
    }
  }

  const input = (k: keyof typeof FIELDS0, label: string, type = 'text') => (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base" type={type}
        value={v[k]} onChange={(e) => set(k, e.target.value)} />
      {errors[k] && <p className="mt-1 text-sm text-red-600">{errors[k]}</p>}
    </div>
  );
  const select = (k: keyof typeof FIELDS0, label: string, opts: EnumOpt) => (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base" value={v[k]} onChange={(e) => set(k, e.target.value)}>
        <option value="">Choose…</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {errors[k] && <p className="mt-1 text-sm text-red-600">{errors[k]}</p>}
    </div>
  );

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      {input('phone', 'Phone', 'tel')}
      {input('teudatZeut', 'Teudat zeut')}
      {input('name', 'Name')}
      <div>
        <label className="block text-sm font-medium text-gray-700">Allowed places</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {places.map((p) => (
            <button key={p} type="button" onClick={() => togglePlace(p)}
              className={`rounded-full border px-2.5 py-1 text-sm ${selPlaces.includes(p) ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700'}`}>{p}</button>
          ))}
        </div>
      </div>
      {input('city', 'City')}
      {input('age', 'Age', 'number')}
      {select('transportation', 'Transportation', enums.transportation)}
      {select('hebrewLevel', 'Hebrew level', enums.hebrewLevel)}
      {select('payType', 'Pay eligibility', enums.payType)}
      {v.payType === 'amount' && input('payAmount', 'Amount', 'number')}
      {select('schedule', 'Schedule', enums.schedule)}
      {fatal && <p className="text-sm text-red-600">{fatal}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
        {busy ? 'Saving…' : 'Add worker'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/admin/add packages/web/app/api/admin/workers
git commit -m "feat(web): /admin/add form + admin-only create route"
```

---

### Task 7: web — docs + final verification

**Files:**
- Modify: `packages/web/README.md`

**Interfaces:**
- Consumes: nothing new.

- [ ] **Step 1: Append an Admin section to `packages/web/README.md`**

```markdown
## Admin area
A worker with `admin = yes` in the Workers tab logs in normally and lands on `/admin`:
- **Workers list** with multi-field filtering (transport, Hebrew level, pay, schedule, city, places, age range, active, name/phone search) — AND across fields, OR within each.
- **Add worker** (`/admin/add`) — phone, teudat zeut, name, allowed places, city, age, transportation, Hebrew level, pay eligibility (+ amount), schedule. Duplicate phones are rejected.

Set `admin = yes` on a worker row to promote them. New Workers columns: `admin · city · age · transportation · hebrew_level · pay_type · pay_amount · schedule`.
```

- [ ] **Step 2: Final verification**

Run:
```bash
pnpm -r typecheck
pnpm -r test
pnpm --filter @scourage/web build
```
Expected: typecheck clean, all tests PASS, web build succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs(web): admin area"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** admin/profile fields + enums + listWorkers (Task 1); addWorker with all validation + duplicate-phone (Task 2); requireAdmin + role routing (Task 3); pure filterWorkers AND/OR/range/search (Task 4); `/admin` list + filter panel (Task 5); `/admin/add` form + admin-only create route (Task 6); docs (Task 7).
- **No literal churn:** the new `Worker` fields are optional, so existing `Worker` literals in tests are untouched.
- **Type consistency:** `AddWorkerInput` (Task 2) is consumed verbatim by the create route (Task 6); `WorkerFilters` (Task 4) is consumed by the filter component (Task 5); enum lists (Task 1) flow into both the list and add pages.
- **Security:** `requireAdmin` guards both admin pages and the create route; a non-admin worker gets `null` → redirect/401. Teudat zeut is written but never logged/echoed.
- **Deferred (future):** edit/delete worker in UI; polished visual; reporting.
