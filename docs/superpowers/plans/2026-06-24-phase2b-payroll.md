# Phase 2b — Payroll & Adjustments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Compute pay from attendance hours with rate precedence, five pay structures, and admin bonuses/penalties; an admin payroll view.

**Architecture:** Pure, unit-tested payroll computation + `Adjustments` data layer in `@scourage/worklog-core`; `pay_structure`/`pay_rate` on Workers and `rate` on ShiftTemplates; admin payroll page in `@scourage/web`.

**Tech Stack:** TypeScript, Next.js 15, Google Sheets, Node test runner via `tsx`.

## Global Constraints

- worklog-core ESM `.ts` imports; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; verify typecheck + build.
- `gateway.updateRow` is 1-based (i+1).
- Rate precedence (hourly): employee `pay_rate` → shift-template `rate` → location `base_rate` → 0 (first non-blank numeric > 0 wins).
- Money rounded to 2 decimals. Currency ILS (display only).
- Hours come from `Attendance` closed/corrected rows (Phase 2a).
- Admin-guarded; `runtime='nodejs'`. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: Payroll computation core + Adjustments data layer

**Files:** Create `packages/worklog-core/src/data/payroll.ts` + `payroll.test.ts`; export from `index.ts`.

**Interfaces — Produces:**
```ts
const PAY_STRUCTURE: readonly {value,label}[]  // hourly, fixed_shift, per_day, monthly, piece
interface WorkedItem { date: string; hours: number; rate: number }
interface Adjustment { id: string; employeePhone: string; date: string; type: string; amount: number; reason: string }
interface PayBreakdown { gross: number; bonuses: number; penalties: number; net: number; basis: string }
resolveHourlyRate(employeeRate: string, templateRate: string, locationRate: string): number
computePay(structure: string, payRate: number, items: WorkedItem[], adjustments: Adjustment[]): PayBreakdown
listAdjustments(gateway, { employeePhone?, from?, to? }): Promise<Adjustment[]>
addAdjustment(gateway, { employeePhone, date, type, amount, reason, createdBy }): Promise<{ok:true;id}|{ok:false;errors}>
```

- [ ] **Step 1: Failing tests** — `payroll.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { resolveHourlyRate, computePay, addAdjustment, listAdjustments } from './payroll.ts';

test('resolveHourlyRate precedence: employee > template > location > 0', () => {
  assert.equal(resolveHourlyRate('50', '40', '30'), 50);
  assert.equal(resolveHourlyRate('', '40', '30'), 40);
  assert.equal(resolveHourlyRate('', '', '30'), 30);
  assert.equal(resolveHourlyRate('', '', ''), 0);
  assert.equal(resolveHourlyRate('0', '40', '30'), 40); // 0 is not a valid rate, fall through
});
test('computePay hourly = sum(hours*rate) + bonuses - penalties', () => {
  const items = [{ date:'2026-07-01', hours:8, rate:50 }, { date:'2026-07-02', hours:4, rate:50 }];
  const adj = [{ id:'a', employeePhone:'1', date:'2026-07-01', type:'bonus', amount:100, reason:'x' },
               { id:'b', employeePhone:'1', date:'2026-07-02', type:'penalty', amount:30, reason:'y' }];
  const r = computePay('hourly', 0, items, adj);
  assert.equal(r.gross, 600); assert.equal(r.bonuses, 100); assert.equal(r.penalties, 30); assert.equal(r.net, 670);
});
test('computePay structures', () => {
  const items = [{date:'2026-07-01',hours:8,rate:0},{date:'2026-07-01',hours:4,rate:0},{date:'2026-07-02',hours:8,rate:0}];
  assert.equal(computePay('fixed_shift', 200, items, []).gross, 600); // 3 shifts * 200
  assert.equal(computePay('per_day', 300, items, []).gross, 600);     // 2 distinct dates * 300
  assert.equal(computePay('monthly', 8000, items, []).gross, 8000);   // flat
  assert.equal(computePay('piece', 0, items, []).gross, 0);
  assert.equal(computePay('piece', 0, items, []).basis, 'manual');
});
test('addAdjustment validates and stores; listAdjustments filters by date', async () => {
  const g = createMemoryGateway({ Adjustments: [['id','employee_phone','date','type','amount','reason','created_by','created_at']] });
  const bad = await addAdjustment(g, { employeePhone:'', date:'2026-07-01', type:'bonus', amount:'10', reason:'x', createdBy:'admin' });
  assert.equal(bad.ok, false);
  const ok = await addAdjustment(g, { employeePhone:'15551230000', date:'2026-07-05', type:'penalty', amount:'25', reason:'late', createdBy:'admin' });
  assert.equal(ok.ok, true);
  const inRange = await listAdjustments(g, { employeePhone:'15551230000', from:'2026-07-01', to:'2026-07-31' });
  assert.equal(inRange.length, 1); assert.equal(inRange[0].amount, 25); assert.equal(inRange[0].type, 'penalty');
  const outRange = await listAdjustments(g, { from:'2026-08-01', to:'2026-08-31' });
  assert.equal(outRange.length, 0);
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement `payroll.ts`:**
```ts
import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';

export const PAY_STRUCTURE = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'fixed_shift', label: 'Fixed per shift' },
  { value: 'per_day', label: 'Per day' },
  { value: 'monthly', label: 'Monthly salary' },
  { value: 'piece', label: 'Piece (manual)' },
] as const;

export interface WorkedItem { date: string; hours: number; rate: number }
export interface Adjustment { id: string; employeePhone: string; date: string; type: string; amount: number; reason: string }
export interface PayBreakdown { gross: number; bonuses: number; penalties: number; net: number; basis: string }

const r2 = (n: number) => Math.round(n * 100) / 100;
function pos(s: string): number { const n = Number(s); return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : 0; }

export function resolveHourlyRate(employeeRate: string, templateRate: string, locationRate: string): number {
  return pos(employeeRate) || pos(templateRate) || pos(locationRate) || 0;
}

export function computePay(structure: string, payRate: number, items: WorkedItem[], adjustments: Adjustment[]): PayBreakdown {
  let gross = 0, basis = structure;
  if (structure === 'hourly') gross = items.reduce((s, i) => s + i.hours * i.rate, 0);
  else if (structure === 'fixed_shift') gross = items.length * payRate;
  else if (structure === 'per_day') gross = new Set(items.map((i) => i.date)).size * payRate;
  else if (structure === 'monthly') gross = payRate;
  else if (structure === 'piece') { gross = 0; basis = 'manual'; }
  const bonuses = adjustments.filter((a) => a.type === 'bonus').reduce((s, a) => s + a.amount, 0);
  const penalties = adjustments.filter((a) => a.type === 'penalty').reduce((s, a) => s + a.amount, 0);
  return { gross: r2(gross), bonuses: r2(bonuses), penalties: r2(penalties), net: r2(gross + bonuses - penalties), basis };
}

const ADJ_COLUMNS = ['id', 'employee_phone', 'date', 'type', 'amount', 'reason', 'created_by', 'created_at'];

export async function listAdjustments(gateway: SheetsGateway, f: { employeePhone?: string; from?: string; to?: string }): Promise<Adjustment[]> {
  const objs = rowsToObjects(await gateway.readTab('Adjustments'));
  return objs
    .filter((o) => (o.id ?? '').trim() !== '')
    .map((o) => ({ id:(o.id??'').trim(), employeePhone:(o.employee_phone??'').trim(), date:(o.date??'').trim(), type:(o.type??'').trim(), amount:Number((o.amount??'0').trim())||0, reason:(o.reason??'').trim() }))
    .filter((a) => (!f.employeePhone || a.employeePhone === f.employeePhone) && (!f.from || a.date >= f.from) && (!f.to || a.date <= f.to));
}

export async function addAdjustment(gateway: SheetsGateway, input: { employeePhone: string; date: string; type: string; amount: string; reason: string; createdBy: string }) {
  const errors: Record<string, string> = {};
  if (!input.employeePhone.trim()) errors.employeePhone = 'Required';
  if (!input.reason.trim()) errors.reason = 'Required';
  if (input.type !== 'bonus' && input.type !== 'penalty') errors.type = 'Invalid';
  if (!(Number(input.amount) > 0)) errors.amount = 'Must be a positive number';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = 'Use YYYY-MM-DD';
  if (Object.keys(errors).length) return { ok: false as const, errors };
  const id = 'adj_' + crypto.randomUUID().slice(0, 8);
  const record: Record<string, string> = { id, employee_phone: input.employeePhone.trim(), date: input.date, type: input.type, amount: String(Number(input.amount)), reason: input.reason.trim(), created_by: input.createdBy, created_at: new Date().toISOString() };
  const rows = await gateway.readTab('Adjustments');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];
  const header = [...existing];
  for (const c of ADJ_COLUMNS) if (!header.includes(c)) header.push(c);
  if (existing.length === 0 || header.length !== existing.length) await gateway.writeHeaderRow('Adjustments', header);
  await gateway.appendRow('Adjustments', objectToRow(record, header));
  return { ok: true as const, id };
}
```

- [ ] **Step 4: Export** `PAY_STRUCTURE, resolveHourlyRate, computePay, listAdjustments, addAdjustment, type WorkedItem, type Adjustment, type PayBreakdown` from `index.ts`.

- [ ] **Step 5: Run — pass + typecheck.**

- [ ] **Step 6: Commit.** `git commit -m "feat(core): payroll computation + adjustments data layer"`

---

### Task 2: Worker pay fields + ShiftTemplate rate

**Files:** Modify `packages/worklog-core/src/data/workers.ts` (`Worker` + `parseWorker`), `add-worker.ts` (`WORKERS_COLUMNS` + input + record), `shift-templates.ts` (`ShiftTemplate.rate` + parse + columns + CRUD record), and their test files.

- [ ] **Step 1: Failing tests** — add to `workers.test.ts`: `parseWorker` reads `pay_structure` + `pay_rate`. Add to `shift-templates.test.ts`: a template with `rate` round-trips (`addTemplate` accepts an optional `rate`, `listTemplates` returns it).
```ts
// workers.test.ts
test('parseWorker reads pay_structure and pay_rate', () => {
  const w = parseWorker({ phone:'15551230000', name:'A', places:'', active:'yes', pay_structure:'monthly', pay_rate:'8000' }, []);
  assert.equal(w.payStructure, 'monthly'); assert.equal(w.payRate, '8000');
});
// shift-templates.test.ts
test('addTemplate stores an optional rate', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate']] });
  const r = await addTemplate(g, { location:'A', label:'Night', days:['Mon'], start:'22:00', end:'06:00', headcount:'1', validFrom:'', validTo:'', rate:'55' });
  assert.equal(r.ok, true);
  const t = (await listTemplates(g))[0];
  assert.equal(t.rate, '55');
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement.**
  - `workers.ts`: `Worker` gains `payStructure?: string; payRate?: string;`; `parseWorker` adds `payStructure: (row.pay_structure ?? '').trim(), payRate: (row.pay_rate ?? '').trim(),`.
  - `add-worker.ts`: `AddWorkerInput` gains `payStructure: string; payRate: string;`; `WORKERS_COLUMNS` append `'pay_structure', 'pay_rate'`; `record` adds them (trim); no new validation required (free numeric/enum — keep lenient; optionally validate payStructure ∈ PAY_STRUCTURE if blank-allowed). Add `payStructure`/`payRate` to the `record`.
  - `shift-templates.ts`: `ShiftTemplate` gains `rate: string`; `AddTemplateInput` gains `rate: string`; `TEMPLATE_COLUMNS` append `'rate'`; `parseTemplate` adds `rate: (o.rate ?? '').trim()`; `recordOf` adds `rate: input.rate.trim()`.

- [ ] **Step 4: Update callers for the new required input fields** so typecheck passes: `AddWorkerInput` now needs `payStructure`/`payRate` — update the workers route coercion (`str(b.payStructure)`, `str(b.payRate)`) and the add-worker form (add `payStructure: ''`, `payRate: ''` to FIELDS0 + a structure `<select>` from `PAY_STRUCTURE` and a `pay_rate` number input). `AddTemplateInput` now needs `rate` — update the shifts route coercion (`str(b.rate)`) and the shifts-admin form (add an optional `rate` number input). (These are required to keep `pnpm --filter @scourage/web build` green.)

- [ ] **Step 5: Run — worklog-core tests + web typecheck + build pass.**

- [ ] **Step 6: Commit.** `git commit -m "feat: worker pay_structure/pay_rate + shift-template rate"`

---

### Task 3: Admin payroll view + adjustments

**Files:** Create `packages/web/app/admin/payroll/page.tsx`, `packages/web/app/admin/payroll/payroll-client.tsx`, `packages/web/app/api/admin/adjustments/route.ts`; add a "Payroll" link on `/admin`.

- [ ] **Step 1: `POST /api/admin/adjustments`** — `requireAdmin` (401); coerce body to the `addAdjustment` input (`employeePhone, date, type, amount, reason`; `createdBy = admin.phone`); call `addAdjustment(getGateway(), input)`; `{ok,id}` or `{errors}` (400). Import depth `../../../../lib`.

- [ ] **Step 2: `/admin/payroll/page.tsx`** — `requireAdmin`→redirect. Read `from`/`to` (default current month: first..last day). Load `listWorkers`, `listTemplates`, `listPlaces`, and for the range `listInstances({from,to})` (to map instance→template+location) + per worker `listAttendance({employeePhone, from, to})` (closed/corrected) + `listAdjustments({employeePhone, from, to})`. For each worker: build `WorkedItem[]` from their attendance — for each attendance row, find its instance → template (by `instance.templateId`) + place (by `instance.location`), `rate = resolveHourlyRate(worker.payRate, template?.rate ?? '', place?.baseRate ?? '')`, `hours = Number(att.hours)||0`; then `computePay(worker.payStructure||'hourly', Number(worker.payRate)||0, items, adjustments)`. Pass rows (name, structure, hours, breakdown) + the worker list to `<PayrollClient>`. `runtime='nodejs'`, `dynamic='force-dynamic'`.

- [ ] **Step 3: `payroll-client.tsx`** (`'use client'`) — a table: worker · structure · hours · gross · bonuses · penalties · **net ₪**, plus a totals row. An "Add adjustment" form (worker `<select>`, type bonus/penalty, amount, reason, date) POSTing to `/api/admin/adjustments` then `router.refresh()`. Show the from/to range; allow editing via simple date inputs that set the URL search params (a tiny form GET) — or just display the default month with the range shown.

- [ ] **Step 4: "Payroll" link on `/admin`.**

- [ ] **Step 5: Verify.** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`.

- [ ] **Step 6: Commit.** `git commit -m "feat(web): admin payroll view + bonuses/penalties"`

---

## Self-Review Notes
- **Spec coverage:** rate precedence (T1 `resolveHourlyRate`), 5 structures (T1 `computePay`), adjustments add/list (T1), worker pay fields + template rate (T2), admin payroll view + adjustment entry (T3). ILS display in T3. piece→manual/0.
- **Type consistency:** `computePay`/`resolveHourlyRate`/`Adjustment`/`WorkedItem` (T1) consumed by T3; `Worker.payStructure/payRate` + `ShiftTemplate.rate` (T2) by T3.
- **Build-green dependency:** T2 Step 4 updates the worker + shift routes/forms for the new required input fields (same pattern as Phase 1a) so the web build stays green.
