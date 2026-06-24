# Phase 1b — Shifts & Assignments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Recurring shift templates that a generator expands into dated instances, a two-layer assignment model, a nightly Vercel-Cron generator that notifies admins via Telegram, and an admin UI to manage it.

**Architecture:** Four new Sheets tabs (`ShiftTemplates`, `ShiftInstances`, `RecurringAssignments`, `ShiftAssignments`) via the existing `SheetsGateway`. Pure, unit-tested data layer in `@scourage/worklog-core`; a thin `notifyAdmins` Telegram helper + cron route + admin pages in `@scourage/web`.

**Tech Stack:** TypeScript, Next.js 15 App Router, Google Sheets via `@scourage/sheets-helper`, Vercel Cron, Telegram Bot API, Node test runner via `tsx`.

## Global Constraints

- worklog-core: ESM explicit `.ts` imports. Tests: `pnpm --filter @scourage/worklog-core test`. Typecheck: `pnpm --filter @scourage/worklog-core typecheck`.
- web: extensionless imports. Verify: `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`. Web tests glob `lib/**/*.test.ts` only.
- Instance id = `<template_id>_<YYYYMMDD>` (deterministic → idempotent generator).
- Overnight shift = `end < start` ⇒ next day (consistent with existing `computeHours`). Identical start==end rejected.
- "Requiring staff" for an instance = count of `status=assigned` ShiftAssignments < instance `headcount`.
- Telegram: `notifyAdmins` is best-effort (try/catch, never throws); no-op (warn) if `TELEGRAM_BOT_TOKEN` or `TELEGRAM_ADMIN_CHAT_IDS` unset.
- Cron route guarded by `CRON_SECRET` bearer header.
- Dates handled as `YYYY-MM-DD` strings; weekday computed via `Date.UTC` to avoid TZ drift. Timezone Asia/Jerusalem is the product TZ but date math here is calendar-date only.
- **`gateway.updateRow(tab, rowNumber, row)` is 1-based (row 1 = the header).** To overwrite the data row at 0-based array index `i` (from `rows.findIndex`), pass `rowNumber = i + 1`. Getting this wrong overwrites the adjacent row — every `updateRow` call below must use `i + 1`.
- Admin-guarded (`requireAdmin`), `runtime='nodejs'`. Commit author = OneStromberg. LOCAL commits only — no push. ponytail.

---

### Task 1: ShiftTemplates data layer

**Files:** Create `packages/worklog-core/src/data/shift-templates.ts` + `shift-templates.test.ts`; export from `index.ts`.

**Interfaces — Produces:**
```ts
interface ShiftTemplate { id: string; location: string; label: string; days: string[]; start: string; end: string; headcount: number; validFrom: string; validTo: string; active: boolean; }
interface AddTemplateInput { location: string; label: string; days: string[]; start: string; end: string; headcount: string; validFrom: string; validTo: string; }
listTemplates(gateway): Promise<ShiftTemplate[]>
addTemplate(gateway, input): Promise<{ ok: true; id: string } | { ok: false; errors: Record<string,string> }>
updateTemplate(gateway, id, input): Promise<{ ok: true } | { ok: false; errors }>
```

- [ ] **Step 1: Failing tests** — `shift-templates.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { listTemplates, addTemplate } from './shift-templates.ts';

const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

test('addTemplate validates and stores a template', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active']] });
  const r = await addTemplate(g, { location: 'Site A', label: 'Night', days: ['Mon','Wed','Fri'], start: '22:00', end: '06:00', headcount: '2', validFrom: '2026-07-01', validTo: '' });
  assert.equal(r.ok, true);
  const ts = await listTemplates(g);
  assert.equal(ts.length, 1);
  assert.deepEqual(ts[0].days, ['Mon','Wed','Fri']);
  assert.equal(ts[0].headcount, 2);
  assert.equal(ts[0].active, true);
  assert.equal(ts[0].end, '06:00');
});

test('addTemplate rejects bad weekday, time, headcount, and identical start/end', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active']] });
  const noDay = await addTemplate(g, { location:'A', label:'D', days:[], start:'08:00', end:'16:00', headcount:'1', validFrom:'', validTo:'' });
  assert.equal(noDay.ok, false); if (!noDay.ok) assert.ok(noDay.errors.days);
  const badTime = await addTemplate(g, { location:'A', label:'D', days:['Mon'], start:'25:00', end:'16:00', headcount:'1', validFrom:'', validTo:'' });
  assert.equal(badTime.ok, false); if (!badTime.ok) assert.ok(badTime.errors.start);
  const badHc = await addTemplate(g, { location:'A', label:'D', days:['Mon'], start:'08:00', end:'16:00', headcount:'0', validFrom:'', validTo:'' });
  assert.equal(badHc.ok, false); if (!badHc.ok) assert.ok(badHc.errors.headcount);
  const same = await addTemplate(g, { location:'A', label:'D', days:['Mon'], start:'08:00', end:'08:00', headcount:'1', validFrom:'', validTo:'' });
  assert.equal(same.ok, false); if (!same.ok) assert.ok(same.errors.end);
});
```

- [ ] **Step 2: Run — verify fail.** `pnpm --filter @scourage/worklog-core test`

- [ ] **Step 3: Implement `shift-templates.ts`:**
```ts
import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface ShiftTemplate {
  id: string; location: string; label: string; days: string[];
  start: string; end: string; headcount: number; validFrom: string; validTo: string; active: boolean;
}
export interface AddTemplateInput {
  location: string; label: string; days: string[];
  start: string; end: string; headcount: string; validFrom: string; validTo: string;
}

const TEMPLATE_COLUMNS = ['id', 'location', 'label', 'days', 'start', 'end', 'headcount', 'valid_from', 'valid_to', 'active'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseTemplate(o: Record<string, string>): ShiftTemplate {
  return {
    id: (o.id ?? '').trim(),
    location: (o.location ?? '').trim(),
    label: (o.label ?? '').trim(),
    days: (o.days ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    start: (o.start ?? '').trim(),
    end: (o.end ?? '').trim(),
    headcount: Number((o.headcount ?? '0').trim()) || 0,
    validFrom: (o.valid_from ?? '').trim(),
    validTo: (o.valid_to ?? '').trim(),
    active: (o.active ?? '').trim().toLowerCase() !== 'no',
  };
}

export async function listTemplates(gateway: SheetsGateway): Promise<ShiftTemplate[]> {
  const objs = rowsToObjects(await gateway.readTab('ShiftTemplates'));
  return objs.filter((o) => (o.id ?? '').trim() !== '').map(parseTemplate);
}

function validate(input: AddTemplateInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!input.location.trim()) e.location = 'Required';
  if (input.days.length === 0 || !input.days.every((d) => (WEEKDAYS as readonly string[]).includes(d))) e.days = 'Pick at least one weekday';
  if (!TIME_RE.test(input.start)) e.start = 'Use HH:MM';
  if (!TIME_RE.test(input.end)) e.end = 'Use HH:MM';
  else if (input.start === input.end) e.end = "Start and end can't be the same";
  const hc = Number(input.headcount);
  if (!Number.isInteger(hc) || hc < 1) e.headcount = 'Must be a positive whole number';
  if (input.validFrom && !DATE_RE.test(input.validFrom)) e.validFrom = 'Use YYYY-MM-DD';
  if (input.validTo && !DATE_RE.test(input.validTo)) e.validTo = 'Use YYYY-MM-DD';
  if (input.validFrom && input.validTo && input.validFrom > input.validTo) e.validTo = 'Must be on/after valid-from';
  return e;
}

function recordOf(id: string, input: AddTemplateInput): Record<string, string> {
  return {
    id, location: input.location.trim(), label: input.label.trim(), days: input.days.join(','),
    start: input.start, end: input.end, headcount: String(Number(input.headcount)),
    valid_from: input.validFrom.trim(), valid_to: input.validTo.trim(), active: 'yes',
  };
}

async function ensureHeader(gateway: SheetsGateway): Promise<string[]> {
  const rows = await gateway.readTab('ShiftTemplates');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];
  const header = [...existing];
  for (const c of TEMPLATE_COLUMNS) if (!header.includes(c)) header.push(c);
  if (existing.length === 0 || header.length !== existing.length) await gateway.writeHeaderRow('ShiftTemplates', header);
  return header;
}

export async function addTemplate(gateway: SheetsGateway, input: AddTemplateInput) {
  const errors = validate(input);
  if (Object.keys(errors).length) return { ok: false as const, errors };
  const id = 'tpl_' + crypto.randomUUID().slice(0, 8);
  const header = await ensureHeader(gateway);
  await gateway.appendRow('ShiftTemplates', objectToRow(recordOf(id, input), header));
  return { ok: true as const, id };
}

export async function updateTemplate(gateway: SheetsGateway, id: string, input: AddTemplateInput) {
  const errors = validate(input);
  if (Object.keys(errors).length) return { ok: false as const, errors };
  const rows = await gateway.readTab('ShiftTemplates');
  const header = rows[0].map((h) => h.trim());
  const idx = rows.findIndex((r, i) => i > 0 && (r[header.indexOf('id')] ?? '').trim() === id);
  if (idx < 0) return { ok: false as const, errors: { id: 'Not found' } };
  const rec = { ...recordOf(id, input), active: (rows[idx][header.indexOf('active')] ?? 'yes') };
  await gateway.updateRow('ShiftTemplates', idx + 1, objectToRow(rec, header)); // updateRow is 1-based

  return { ok: true as const };
}
```
(If `gateway.updateRow` signature differs, read `packages/sheets-helper/src/gateway.ts` and match it — memory + google gateways both implement it.)

- [ ] **Step 4: Export** in `index.ts`: `export { listTemplates, addTemplate, updateTemplate, parseTemplate, WEEKDAYS, type ShiftTemplate, type AddTemplateInput } from './data/shift-templates.ts';`

- [ ] **Step 5: Run — pass + typecheck.** `pnpm --filter @scourage/worklog-core test && pnpm --filter @scourage/worklog-core typecheck`

- [ ] **Step 6: Commit.** `git add packages/worklog-core && git commit -m "feat(core): ShiftTemplates data layer (CRUD + validation)"`

---

### Task 2: Assignments data layer (recurring + per-instance)

**Files:** Create `packages/worklog-core/src/data/shift-assignments.ts` + test; export from `index.ts`.

**Interfaces — Produces:**
```ts
interface RecurringAssignment { templateId: string; employeePhone: string; active: boolean; }
interface ShiftAssignment { instanceId: string; employeePhone: string; source: string; status: string; }
listRecurring(gateway, templateId?): Promise<RecurringAssignment[]>
addRecurring(gateway, templateId, phone): Promise<void>      // idempotent: reactivates/keeps one row per (template,phone)
removeRecurring(gateway, templateId, phone): Promise<void>   // sets active=no
listAssignments(gateway, { instanceId?, employeePhone? }): Promise<ShiftAssignment[]>  // status=assigned only
assignManual(gateway, instanceId, phone, assignedBy): Promise<void>
removeAssignment(gateway, instanceId, phone): Promise<void>  // sets status=removed
```

- [ ] **Step 1: Failing tests** — cover: addRecurring then listRecurring returns it active; removeRecurring flips active=no; assignManual then listAssignments({instanceId}) returns the phone with status=assigned; removeAssignment makes listAssignments exclude it; a removed assignment is not returned. Use `createMemoryGateway({ RecurringAssignments:[[...]], ShiftAssignments:[[...]] })` with the header rows `['template_id','employee_phone','active','created_at']` and `['instance_id','employee_phone','source','status','assigned_at','assigned_by']`.
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { addRecurring, listRecurring, removeRecurring, assignManual, listAssignments, removeAssignment } from './shift-assignments.ts';

function gw() {
  return createMemoryGateway({
    RecurringAssignments: [['template_id','employee_phone','active','created_at']],
    ShiftAssignments: [['instance_id','employee_phone','source','status','assigned_at','assigned_by']],
  });
}
test('recurring add/list/remove', async () => {
  const g = gw();
  await addRecurring(g, 'tpl_1', '15551230000');
  let r = await listRecurring(g, 'tpl_1');
  assert.equal(r.length, 1); assert.equal(r[0].employeePhone, '15551230000'); assert.equal(r[0].active, true);
  await removeRecurring(g, 'tpl_1', '15551230000');
  r = await listRecurring(g, 'tpl_1');
  assert.equal(r.filter((x) => x.active).length, 0);
});
test('manual assign/list/remove (status filtered)', async () => {
  const g = gw();
  await assignManual(g, 'tpl_1_20260701', '15551230000', 'admin');
  let a = await listAssignments(g, { instanceId: 'tpl_1_20260701' });
  assert.equal(a.length, 1); assert.equal(a[0].status, 'assigned');
  await removeAssignment(g, 'tpl_1_20260701', '15551230000');
  a = await listAssignments(g, { instanceId: 'tpl_1_20260701' });
  assert.equal(a.length, 0);
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement `shift-assignments.ts`** — header-driven append/update via the gateway, mirroring the `ensureHeader` pattern from Task 1. `listAssignments` filters `status==='assigned'` and by the provided `instanceId`/`employeePhone`. `addRecurring` checks for an existing `(template,phone)` row: if found set `active=yes` via `updateRow`, else append; `removeRecurring` sets `active=no`. `assignManual` appends `{instance_id, employee_phone, source:'manual', status:'assigned', assigned_at: new Date().toISOString(), assigned_by}` (only if no active row exists for that pair). `removeAssignment` sets the matching row's `status='removed'`. Use `crypto`/`new Date().toISOString()` for timestamps (normal runtime — allowed). Define `RECURRING_COLUMNS` and `ASSIGN_COLUMNS` matching the headers above.

- [ ] **Step 4: Export** the six functions + two types from `index.ts`.

- [ ] **Step 5: Run — pass + typecheck.**

- [ ] **Step 6: Commit.** `git commit -m "feat(core): shift assignments data layer (recurring + per-instance)"`

---

### Task 3: Shift instances + the generator

**Files:** Create `packages/worklog-core/src/data/shift-instances.ts` + test; export from `index.ts`.

**Interfaces — Consumes:** `listTemplates`/`ShiftTemplate` (Task 1), `listRecurring`/`listAssignments` style access (Task 2). **Produces:**
```ts
interface ShiftInstance { id: string; templateId: string; location: string; date: string; start: string; end: string; headcount: number; status: string; }
listInstances(gateway, { from, to, location? }): Promise<ShiftInstance[]>
cancelInstance(gateway, id): Promise<void>          // status=cancelled
generateInstances(gateway, today: string, horizonDays?: number): Promise<{ templatesProcessed: number; instancesCreated: number; assignmentsSeeded: number; horizonEnd: string }>
```

- [ ] **Step 1: Failing tests** — the heart of the phase. Cover with a memory gateway pre-seeded with ShiftTemplates + RecurringAssignments + empty ShiftInstances/ShiftAssignments:
  - weekday-mask expansion: template days `['Wed']`, today `2026-07-01` (a Wednesday), horizon 14 → instances on `2026-07-01`, `2026-07-08` only.
  - valid range clipping: `valid_from='2026-07-08'` excludes `2026-07-01`.
  - overnight instance keeps `end='06:00'`.
  - idempotency: running `generateInstances` twice creates 0 new the second time (`instancesCreated===0`).
  - recurring seeding: an active RecurringAssignment on the template yields a `ShiftAssignment` (source=recurring) for each generated instance; second run seeds 0.
  - `listInstances({from,to})` returns within range; `cancelInstance` sets status cancelled and excludes it from a `status!=cancelled` count.
  Provide concrete asserts (instance ids `tpl_1_20260701` etc.).
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { generateInstances, listInstances } from './shift-instances.ts';
import { listAssignments } from './shift-assignments.ts';

function seed() {
  return createMemoryGateway({
    ShiftTemplates: [
      ['id','location','label','days','start','end','headcount','valid_from','valid_to','active'],
      ['tpl_1','Site A','Night','Wed','22:00','06:00','2','','','yes'],
    ],
    RecurringAssignments: [['template_id','employee_phone','active','created_at'], ['tpl_1','15551230000','yes','']],
    ShiftInstances: [['id','template_id','location','date','start','end','headcount','status','generated_at']],
    ShiftAssignments: [['instance_id','employee_phone','source','status','assigned_at','assigned_by']],
  });
}
test('generates weekday instances within horizon, idempotent, seeds recurring', async () => {
  const g = seed();
  const r1 = await generateInstances(g, '2026-07-01', 14); // Wed
  assert.equal(r1.instancesCreated, 2); // 07-01, 07-08
  const ins = await listInstances(g, { from: '2026-07-01', to: '2026-07-31' });
  assert.deepEqual(ins.map((i) => i.id).sort(), ['tpl_1_20260701','tpl_1_20260708']);
  assert.equal(ins[0].end, '06:00');
  const a = await listAssignments(g, { instanceId: 'tpl_1_20260701' });
  assert.equal(a.length, 1); assert.equal(a[0].source, 'recurring');
  const r2 = await generateInstances(g, '2026-07-01', 14);
  assert.equal(r2.instancesCreated, 0);
  assert.equal(r2.assignmentsSeeded, 0);
});
test('clips to valid_from', async () => {
  const g = seed();
  // mutate template valid_from to exclude 07-01
  const rows = g.dump().ShiftTemplates; rows[1][rows[0].indexOf('valid_from')] = '2026-07-08';
  const r = await generateInstances(g, '2026-07-01', 14);
  const ins = await listInstances(g, { from: '2026-07-01', to: '2026-07-31' });
  assert.deepEqual(ins.map((i) => i.id), ['tpl_1_20260708']);
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement `shift-instances.ts`.** Pure date helpers (no Math.random; `new Date(Date.UTC(...))` for weekday):
```ts
const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function addDays(iso: string, n: number): string {
  const [y,m,d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m-1, d + n));
  return dt.toISOString().slice(0,10);
}
function weekday(iso: string): string {
  const [y,m,d] = iso.split('-').map(Number);
  return WD[new Date(Date.UTC(y, m-1, d)).getUTCDay()];
}
function compact(iso: string): string { return iso.replace(/-/g, ''); }
```
  `generateInstances(gateway, today, horizonDays = 42)`: load templates (active), existing instance ids (Set), active recurring (grouped by template), existing assignment keys `instanceId|phone` (any status, Set). Iterate each template; for `offset` in `0..horizonDays`, `date = addDays(today, offset)`; skip if `validFrom && date < validFrom`, if `validTo && date > validTo`, if `weekday(date)` not in `template.days`. `id = template.id + '_' + compact(date)`. If id not in existing set → append ShiftInstance row (`status:'scheduled'`, copy start/end/headcount, `generated_at: new Date().toISOString()`), add to set, `instancesCreated++`. Then for each active recurring employee on the template, key `id|phone`; if not in assignment-key set → append ShiftAssignment (`source:'recurring', status:'assigned', assigned_by:'system'`), add key, `assignmentsSeeded++`. Return summary with `horizonEnd = addDays(today, horizonDays)`. Use `objectToRow` + ensureHeader pattern; **batch reads once at start, append within the loop** (acceptable for memory gateway; the google gateway appends per row — fine for nightly volume). `listInstances` filters by date range + optional location, excludes nothing by status (caller decides) but expose `status`. `cancelInstance` sets `status='cancelled'` via updateRow.

- [ ] **Step 4: Export** `generateInstances, listInstances, cancelInstance, type ShiftInstance` from `index.ts`.

- [ ] **Step 5: Run — pass + typecheck.**

- [ ] **Step 6: Commit.** `git commit -m "feat(core): shift instance generator (rolling horizon, idempotent, recurring seeding)"`

---

### Task 4: Telegram `notifyAdmins` helper

**Files:** Create `packages/web/lib/telegram.ts` + `packages/web/lib/telegram.test.ts`.

**Interfaces — Produces:** `notifyAdmins(text: string): Promise<void>` (best-effort).

- [ ] **Step 1: Failing test** — `telegram.test.ts` (runs under web's `lib/**` glob). Test the no-op-without-env path by importing a pure helper:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminChatIds, buildSendUrl } from './telegram.ts';

test('adminChatIds parses comma list and trims', () => {
  assert.deepEqual(adminChatIds('111, 222 ,333'), ['111','222','333']);
  assert.deepEqual(adminChatIds(''), []);
  assert.deepEqual(adminChatIds(undefined), []);
});
test('buildSendUrl builds the telegram endpoint', () => {
  assert.equal(buildSendUrl('TOK'), 'https://api.telegram.org/botTOK/sendMessage');
});
```

- [ ] **Step 2: Run — fail.** `pnpm --filter @scourage/web test`

- [ ] **Step 3: Implement `telegram.ts`:**
```ts
export function adminChatIds(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}
export function buildSendUrl(token: string): string {
  return `https://api.telegram.org/bot${token}/sendMessage`;
}
/** Best-effort: never throws; no-op (warn) if env missing. */
export async function notifyAdmins(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const ids = adminChatIds(process.env.TELEGRAM_ADMIN_CHAT_IDS);
  if (!token || ids.length === 0) { console.warn('notifyAdmins: TELEGRAM env not set; skipping'); return; }
  const url = buildSendUrl(token);
  for (const chat_id of ids) {
    try {
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text }) });
    } catch (err) {
      console.error('notifyAdmins: telegram send failed for', chat_id, err);
    }
  }
}
```

- [ ] **Step 4: Run — pass + typecheck.** `pnpm --filter @scourage/web test && pnpm --filter @scourage/web typecheck`

- [ ] **Step 5: Commit.** `git commit -m "feat(web): notifyAdmins Telegram helper (best-effort, env-gated)"`

---

### Task 5: Cron route + on-demand regeneration

**Files:** Create `packages/web/app/api/cron/generate-shifts/route.ts`; modify `packages/web/vercel.json` (add cron); modify `packages/web/.env.example` if present (document `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_IDS`).

**Interfaces — Consumes:** `generateInstances` (Task 3), `notifyAdmins` (Task 4), `getGateway`.

- [ ] **Step 1: Implement the cron route** `route.ts`:
```ts
import { getGateway } from '../../../../lib/sheets';
import { generateInstances } from '@scourage/worklog-core';
import { notifyAdmins } from '../../../../lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const today = new Date().toISOString().slice(0, 10);
  try {
    const r = await generateInstances(getGateway(), today);
    await notifyAdmins(`🗓 Shift generator: ${r.instancesCreated} new instances, ${r.assignmentsSeeded} assignments seeded (through ${r.horizonEnd}).`);
    return Response.json({ ok: true, ...r });
  } catch (err) {
    console.error('generate-shifts cron failed:', err);
    await notifyAdmins('⚠️ Shift generator FAILED — check logs.');
    return Response.json({ error: 'generation failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add the cron schedule** to `packages/web/vercel.json` — merge a `crons` array (keep the existing `framework` key):
```json
{ "framework": "nextjs", "crons": [ { "path": "/api/cron/generate-shifts", "schedule": "0 2 * * *" } ] }
```
(Read the current `vercel.json` first and merge, don't overwrite.)

- [ ] **Step 3: Verify.** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`

- [ ] **Step 4: Commit.** `git commit -m "feat(web): nightly shift-generator cron route + Telegram run summary"`

---

### Task 6: Admin UI — shift templates CRUD

**Files:** Create `packages/web/app/admin/shifts/page.tsx`, `packages/web/app/admin/shifts/shifts-admin.tsx`, `packages/web/app/api/admin/shifts/route.ts`; add a "Shifts" link on `/admin`.

- [ ] **Step 1: Create `POST /api/admin/shifts` route** — `requireAdmin` (401), coerce body to `AddTemplateInput` (`days` from a `string[]`, others via `str`), call `addTemplate(getGateway(), input)`; on success also call `generateInstances(getGateway(), today)` so the new template's instances appear immediately (on-demand regeneration); return `{ ok:true, id }` or `{ errors }` (400). Mirror the existing `/api/admin/places/route.ts` shape.

- [ ] **Step 2: Create the server page** `shifts/page.tsx` — `requireAdmin`→redirect; load `listTemplates(getGateway())` and active places via `loadActivePlaces`; render `<ShiftsAdmin templates={...} places={...} />`. `runtime='nodejs'`, `dynamic='force-dynamic'`.

- [ ] **Step 3: Create the client** `shifts-admin.tsx` — a list of existing templates (location · label · days · start–end · headcount) and an "Add template" form: location `<select>` (from places), label text, weekday checkboxes (Mon…Sun), start/end `<input type="time">`, headcount number, valid-from/to `<input type="date">`. Submit POSTs to `/api/admin/shifts`, shows field errors, `router.refresh()` on success. Reuse the input styling from `add-worker-form.tsx`.

- [ ] **Step 4: Add a "Shifts" link** on `/admin` next to "Places".

- [ ] **Step 5: Verify.** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`

- [ ] **Step 6: Commit.** `git commit -m "feat(web): admin shift-template management (/admin/shifts)"`

---

### Task 7: Admin UI — recurring assignments + instances view

**Files:** Modify `packages/web/app/admin/shifts/shifts-admin.tsx`; create `packages/web/app/api/admin/shift-assignments/route.ts`; modify `shifts/page.tsx` to also load recurring + upcoming instances.

- [ ] **Step 1: `POST /api/admin/shift-assignments` route** — `requireAdmin`; actions `{ action:'addRecurring'|'removeRecurring', templateId, phone }` → call the matching Task-2 function; on `addRecurring` also `generateInstances(today)` to seed existing future instances; return `{ ok:true }`.

- [ ] **Step 2: Page data** — in `shifts/page.tsx`, also load `listWorkers` (for the employee picker), and for each template its `listRecurring`, and `listInstances({ from: today, to: today+42 })` with per-instance assigned counts (via `listAssignments`). Pass to the client.

- [ ] **Step 3: Recurring editor** — per template, show assigned (recurring) employees with a remove button and an "add employee" picker (workers whose `places` include the template location shown first; others selectable with a soft "not a member of this site" warning). Buttons POST to `/api/admin/shift-assignments`, `router.refresh()`.

- [ ] **Step 4: Instances view** — a read-only list of upcoming instances per template/location: date · time · `assigned/headcount` with a "⚠ needs staff" flag when assigned < headcount.

- [ ] **Step 5: Verify.** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`

- [ ] **Step 6: Commit.** `git commit -m "feat(web): recurring-assignment editor + upcoming-instances view"`

---

## Self-Review Notes
- **Spec coverage:** 4 tabs (T1–T3), generator with idempotency/seeding/clipping/overnight (T3), Telegram notify (T4), Vercel-Cron nightly + on-demand regen (T5, T6/T7), admin template CRUD + recurring assignment + instances view (T6, T7), "requiring staff" = assigned<headcount (T7). Rich per-instance drag/claim deferred to Phase 3 per spec.
- **Type consistency:** `AddTemplateInput`/`ShiftTemplate` (T1) consumed by T3/T6; assignment fns (T2) consumed by T3/T7; `generateInstances` summary shape (T3) consumed by T5; `notifyAdmins` (T4) by T5.
- **Date math** uses `Date.UTC` for calendar correctness; timestamps via `new Date().toISOString()` (normal runtime, allowed).
- **No new deps.** Telegram via `fetch`; cron via Vercel.
