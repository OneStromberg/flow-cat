# F1 — Worker Card (detail + edit) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** A per-worker page `/admin/workers/[phone]` showing contacts + an edit form for all worker fields (incl. pay structure/rate, active, admin), linked from the workers list. Closes PM item 1.4 and unblocks fixing Ilya's pay structure in the UI.

**Tech Stack:** TypeScript, Next.js 15 App Router, Google Sheets, Node test runner.

## Global Constraints
- worklog-core ESM `.ts` imports; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; verify typecheck + build.
- `gateway.updateRow` is 1-based (data row at array index `i` → `i+1`).
- Phone is the key — `updateWorker` matches by normalized phone and does NOT change it. Identity/admin from session.
- Admin-guarded. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: `updateWorker` data layer
**Files:** `packages/worklog-core/src/data/add-worker.ts` (add `updateWorker` + `UpdateWorkerInput` next to `addWorker`, reusing its `WORKERS_COLUMNS`/`inEnum`); export from `index.ts`; test in `add-worker.test.ts`.

**Interfaces — Produces:**
```ts
interface UpdateWorkerInput {
  teudatZeut: string; name: string; places: string[]; city: string; age: string;
  transportation: string; hebrewLevel: string; payType: string; payAmount: string;
  schedule: string; gender: string; payStructure: string; payRate: string;
  active: boolean; admin: boolean;
}
updateWorker(gateway, phone: string, input: UpdateWorkerInput): Promise<{ok:true}|{ok:false;errors:Record<string,string>}>
```

- [ ] **Step 1: Failing test** in `add-worker.test.ts`:
```ts
import { updateWorker } from './add-worker.ts';
import { findWorker } from './workers.ts';
test('updateWorker edits an existing worker by phone (incl pay structure)', async () => {
  const g = createMemoryGateway({ Workers: [
    ['phone','name','places','active','teudat_zeut','admin','pay_structure','pay_rate'],
    ['972501234567','Ilya','Lod','yes','9','','monthly','37'],
  ]});
  const r = await updateWorker(g, '0501234567', {
    teudatZeut:'9', name:'Ilya', places:['Lod'], city:'', age:'', transportation:'', hebrewLevel:'',
    payType:'', payAmount:'', schedule:'', gender:'', payStructure:'hourly', payRate:'37', active:true, admin:false,
  });
  assert.equal(r.ok, true);
  const w = await findWorker(g, '972501234567');
  assert.equal(w?.payStructure, 'hourly'); assert.equal(w?.payRate, '37'); assert.equal(w?.active, true);
  const miss = await updateWorker(g, '10000000000', { /* ...same shape... */ } as any);
  assert.equal(miss.ok, false);
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement `updateWorker`** in `add-worker.ts` (reuse `inEnum`, `WORKERS_COLUMNS`, `normalizePhone`, `objectToRow`):
  - Validate: `name`/`teudatZeut` required (trim); enums (`gender`,`transportation`,`hebrewLevel`,`payType`,`schedule`) via `inEnum`; `age` numeric if present; `payAmount` numeric required iff `payType==='amount'`. (Mirror addWorker's checks minus the duplicate-phone check.)
  - Find the row: `const rows = await gateway.readTab('Workers'); const header = rows[0].map(h=>h.trim()); const target = normalizePhone(phone); const i = rows.findIndex((r,idx)=> idx>0 && normalizePhone(r[header.indexOf('phone')] ?? '')===target);` → if `i<0` return `{ok:false, errors:{phone:'Not found'}}`.
  - Build the record (keep the existing phone, normalized): `phone: target, name, greeting:(keep existing greeting if present else ''), places: input.places.join(', '), active: input.active?'yes':'no', token:(keep existing token), teudat_zeut, admin: input.admin?'yes':'', city, age, transportation, hebrew_level, pay_type, pay_amount:(payType==='amount'?payAmount:''), schedule, gender, pay_structure, pay_rate, telegram_chat_id:(keep existing)`. **Preserve** greeting/token/telegram_chat_id from the existing row (read them by header index) so the edit doesn't wipe them.
  - Ensure header has all `WORKERS_COLUMNS` (+ any existing); `updateRow('Workers', i+1, objectToRow(record, header))`. Return `{ok:true}`.

- [ ] **Step 4: Export** `updateWorker`, `type UpdateWorkerInput` from `index.ts`.
- [ ] **Step 5: Run — pass + typecheck.**
- [ ] **Step 6: Commit.** `git commit -m "feat(core): updateWorker (edit a worker by phone, preserving greeting/token/telegram)"`

---

### Task 2: Worker card page + route + list link
**Files:** Create `packages/web/app/api/admin/workers/[phone]/route.ts`, `packages/web/app/admin/workers/[phone]/page.tsx`, `packages/web/app/admin/workers/[phone]/worker-card.tsx`; modify `packages/web/app/admin/workers-filter.tsx` (link rows to the card).

- [ ] **Step 1: Route** `POST /api/admin/workers/[phone]` — `requireAdmin` (401); `const { phone } = await context.params`; coerce body to `UpdateWorkerInput` (`places` string[]; `active`/`admin` booleans; others via `str()`); `updateWorker(getGateway(), phone, input)`; `{ok}` or `{errors}` (400). Import depth `../../../../../lib`.
- [ ] **Step 2: Page** `/admin/workers/[phone]/page.tsx` — `requireAdmin`→redirect; `const {phone}=await params`; `findWorker(getRequestGateway(), phone)` (→ `notFound()` if null); `loadActivePlaces`. Render a **contacts** header (name; phone as a `tel:` link e.g. `<a href={`tel:${worker.phone}`}>`; teudat; city) + `<WorkerCard worker={...} places={...} enums={{GENDER,TRANSPORTATION,HEBREW_LEVEL,PAY_TYPE,SCHEDULE,PAY_STRUCTURE}} />`. A "‹ Back to workers" link. `runtime='nodejs'`,`dynamic='force-dynamic'`. Import depth `../../../../lib`.
- [ ] **Step 3: `worker-card.tsx`** (`'use client'`) — an edit form prefilled from `worker`: name, teudat, places multi-select (chips/checkboxes from `places`), city, age, gender/transportation/hebrewLevel/payType(+payAmount when amount)/schedule selects, **payStructure** select (from `PAY_STRUCTURE`), **payRate** number, an **Active** toggle and an **Admin** toggle. Submit POSTs `{...fields, active, admin}` to `/api/admin/workers/${worker.phone}`; show field errors; on success `router.refresh()` + a saved indicator. Reuse the input/select styling from `add-worker-form.tsx`.
- [ ] **Step 4: List link** — in `workers-filter.tsx`, make each worker row's name a `<a href={`/admin/workers/${w.phone}`}>` (or wrap the row) so the admin can open the card. (Keep the filter table otherwise.)
- [ ] **Step 5: Verify** typecheck + build (`/admin/workers/[phone]` + the route present).
- [ ] **Step 6: Commit.** `git commit -m "feat(web): worker card — contacts + edit (pay structure, active/admin) + list link"`

---

## Self-Review Notes
- **Coverage:** updateWorker (T1) preserves greeting/token/telegram_chat_id; card view+edit + tel: contact + list link (T2). Fixes Ilya via the payStructure select.
- **Type consistency:** `UpdateWorkerInput` (T1) consumed by the route + form (T2); enums passed from worklog-core.
- **Security:** route requireAdmin; phone is the path key (digits, URL-safe); identity not from body.
