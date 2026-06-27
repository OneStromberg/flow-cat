# UX Part B — Shifts Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Split the monolithic shifts page into focused pages, add a week-based instance grid, per-instance + template-level edit, and copy-template-to-period. Mobile-first.

**Architecture:** New worklog-core functions (`updateInstance`, `applyTemplateEdit`, `copyTemplate`); awaited regeneration in routes; new pages `/admin/shifts` (week grid), `/admin/shifts/new`, `/admin/shifts/templates`, `/admin/shifts/templates/[id]`, `/admin/shifts/instances/[id]`. Reuses Phase-1b data layer.

**Tech Stack:** TypeScript, Next.js 15 App Router, Google Sheets, Node test runner via `tsx`.

## Global Constraints
- worklog-core ESM `.ts` imports; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; verify typecheck + build.
- `gateway.updateRow` is 1-based (data row at array index `i` → `i+1`).
- Instance id = `<templateId>_<YYYYMMDD>`. Dates are `YYYY-MM-DD`; weekday via `Date.UTC`. Reuse `WEEKDAYS` from shift-templates.
- Week grid + detail pages load instances + ALL assignments ONCE and count in memory (no per-instance reads — protects the Sheets quota).
- On-demand `generateInstances` in routes is **awaited** (not fire-and-forget) so seeding failures surface.
- Admin-guarded routes/pages; `runtime='nodejs'`. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: Data layer — updateInstance, applyTemplateEdit, copyTemplate
**Files:** Modify `packages/worklog-core/src/data/shift-instances.ts` (add `updateInstance`, `applyTemplateEdit`), `packages/worklog-core/src/data/shift-templates.ts` (add `copyTemplate`); export from `index.ts`; tests in the respective `.test.ts`.

**Interfaces — Produces:**
```ts
updateInstance(gateway, id, fields: { date?; start?; end?; headcount? }): Promise<{ok:true}|{ok:false;error}>
applyTemplateEdit(gateway, templateId, today): Promise<{ updated:number; cancelled:number }>
copyTemplate(gateway, templateId, opts: { validFrom; validTo; carryAssignments:boolean }): Promise<{ok:true;id}|{ok:false;errors}>
```

- [ ] **Step 1: Failing tests.** In `shift-instances.test.ts`:
```ts
import { updateInstance, applyTemplateEdit } from './shift-instances.ts';
test('updateInstance overrides one instance row', async () => {
  const g = createMemoryGateway({ ShiftInstances: [
    ['id','template_id','location','date','start','end','headcount','status','generated_at'],
    ['tpl_1_20260701','tpl_1','Site A','2026-07-01','08:00','16:00','1','scheduled',''],
  ]});
  const r = await updateInstance(g, 'tpl_1_20260701', { start:'09:00', headcount:'3' });
  assert.equal(r.ok, true);
  const i = (await listInstances(g, { from:'2026-07-01', to:'2026-07-01' }))[0];
  assert.equal(i.start, '09:00'); assert.equal(i.headcount, 3);
  const bad = await updateInstance(g, 'tpl_1_20260701', { start:'99:99' });
  assert.equal(bad.ok, false);
});
test('applyTemplateEdit updates valid future instances and cancels now-invalid ones', async () => {
  const g = createMemoryGateway({
    ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate'],
      ['tpl_1','Site A','Day','Wed','10:00','18:00','2','','','yes','']], // edited: now Wed only, 10-18, hc 2
    ShiftInstances: [['id','template_id','location','date','start','end','headcount','status','generated_at'],
      ['tpl_1_20260701','tpl_1','Site A','2026-07-01','08:00','16:00','1','scheduled',''],  // Wed → update
      ['tpl_1_20260703','tpl_1','Site A','2026-07-03','08:00','16:00','1','scheduled','']], // Fri → cancel
  });
  const r = await applyTemplateEdit(g, 'tpl_1', '2026-07-01');
  assert.equal(r.updated, 1); assert.equal(r.cancelled, 1);
  const ins = await listInstances(g, { from:'2026-07-01', to:'2026-07-31' });
  const wed = ins.find((i)=>i.id==='tpl_1_20260701'); const fri = ins.find((i)=>i.id==='tpl_1_20260703');
  assert.equal(wed?.start, '10:00'); assert.equal(wed?.headcount, 2); assert.equal(wed?.status, 'scheduled');
  assert.equal(fri?.status, 'cancelled');
});
```
In `shift-templates.test.ts`:
```ts
import { copyTemplate, listTemplates } from './shift-templates.ts';
import { listRecurring, addRecurring } from './shift-assignments.ts';
test('copyTemplate duplicates fields with new validity and carries assignments', async () => {
  const g = createMemoryGateway({
    ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate']],
    RecurringAssignments: [['template_id','employee_phone','active','created_at']],
  });
  const src = await addTemplate(g, { location:'Site A', label:'Day', days:['Mon','Wed'], start:'08:00', end:'16:00', headcount:'2', validFrom:'2026-01-01', validTo:'2026-06-30', rate:'40' });
  const srcId = src.ok ? src.id : '';
  await addRecurring(g, srcId, '15551230000');
  const cp = await copyTemplate(g, srcId, { validFrom:'2026-07-01', validTo:'2026-12-31', carryAssignments:true });
  assert.equal(cp.ok, true);
  const newId = cp.ok ? cp.id : '';
  const t = (await listTemplates(g)).find((x)=>x.id===newId)!;
  assert.deepEqual(t.days, ['Mon','Wed']); assert.equal(t.start,'08:00'); assert.equal(t.validFrom,'2026-07-01'); assert.equal(t.rate,'40');
  const rec = (await listRecurring(g, newId)).filter((r)=>r.active);
  assert.equal(rec.length, 1); assert.equal(rec[0].employeePhone, '15551230000');
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement.**
  `shift-instances.ts`:
  - `updateInstance(gateway, id, fields)` — read ShiftInstances, find row by id (i>0), validate provided `start`/`end` against `/^([01]\d|2[0-3]):[0-5]\d$/` and `headcount` as positive int when provided; build a new row overriding only provided columns (`date`,`start`,`end`,`headcount`); `updateRow('ShiftInstances', i+1, row)`. Return error if not found / invalid.
  - `applyTemplateEdit(gateway, templateId, today)` — load the template (via `listTemplates`), load ShiftInstances rows for this template with `date >= today` and `status === 'scheduled'`. For each: compute `valid = template.days.includes(weekday(date)) && (!validFrom||date>=validFrom) && (!validTo||date<=validTo)`. If valid → overwrite `location,start,end,headcount` to the template's, `updateRow(i+1)`, `updated++`. If not valid → set `status='cancelled'`, `updateRow(i+1)`, `cancelled++`. Reuse the existing `weekday` helper. Return `{updated, cancelled}`.
  `shift-templates.ts`:
  - `copyTemplate(gateway, templateId, opts)` — find the source template (via `listTemplates`); if missing return `{ok:false, errors:{id:'Not found'}}`. Call `addTemplate(gateway, { location, label, days, start, end, headcount:String(src.headcount), validFrom:opts.validFrom, validTo:opts.validTo, rate:src.rate })`. If `!ok` return it. If `opts.carryAssignments`: `const recs = (await listRecurring(gateway, templateId)).filter(r=>r.active); for (const r of recs) await addRecurring(gateway, newId, r.employeePhone);`. Return `{ok:true, id:newId}`. (Import `listRecurring`, `addRecurring` from `./shift-assignments.ts`.)

- [ ] **Step 4: Export** `updateInstance`, `applyTemplateEdit`, `copyTemplate` from `index.ts`.
- [ ] **Step 5: Run — pass + typecheck.**
- [ ] **Step 6: Commit.** `git commit -m "feat(core): updateInstance, applyTemplateEdit, copyTemplate"`

---

### Task 2: Shift admin routes (edit template, instance ops, copy)
**Files:** Create `packages/web/app/api/admin/shifts/[id]/route.ts`, `packages/web/app/api/admin/shift-instances/[id]/route.ts`, `packages/web/app/api/admin/shifts/copy/route.ts`.

- [ ] **Step 1: `POST /api/admin/shifts/[id]`** (edit template) — `requireAdmin`; body coerced to `AddTemplateInput`; `updateTemplate(gw, id, input)`; if ok, `await applyTemplateEdit(gw, id, today)` then `await generateInstances(gw, today)`; return `{ok}` or `{errors}`. Import depth `../../../../../lib`.
- [ ] **Step 2: `POST /api/admin/shift-instances/[id]`** — `requireAdmin`; body `{ action: 'update'|'cancel'|'assign'|'remove', ... }`. `update`→`updateInstance(gw,id,{date,start,end,headcount})`; `cancel`→`cancelInstance(gw,id)`; `assign`→`assignManual(gw,id,phone,admin.phone)`; `remove`→`removeAssignment(gw,id,phone)`. Return `{ok}`.
- [ ] **Step 3: `POST /api/admin/shifts/copy`** — `requireAdmin`; body `{ templateId, validFrom, validTo, carryAssignments }`; `copyTemplate(...)`; if ok `await generateInstances(gw, today)`; return `{ok,id}` or `{errors}`.
- [ ] **Step 4: Verify** typecheck + build.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): shift edit/instance/copy admin routes (awaited regen)"`

---

### Task 3: `/admin/shifts` week grid + week nav
**Files:** Replace `packages/web/app/admin/shifts/page.tsx`; create `packages/web/app/admin/shifts/week-grid.tsx`.

- [ ] **Step 1: page** — `requireAdmin`→redirect. Read `?week=YYYY-MM-DD` (default: the Sunday of the current week via a small inline helper). Compute `weekStart` (Sunday) + `weekDays = [weekStart..+6]`, `weekEnd`. Load `listInstances(gw, { from: weekStart, to: weekEnd })` + ALL `ShiftAssignments` once (`listAssignments(gw, {})` returns all active) → count assigned per `instanceId` in memory. Build day→instances map. Pass to `<WeekGrid weekStart days instancesByDay prevWeek nextWeek />`. `runtime='nodejs'`,`dynamic='force-dynamic'`.
- [ ] **Step 2: `week-grid.tsx`** (can be a server component — static links; no client state needed) — header row: `‹` link to `?week=<prevSunday>`, centered `Week of <weekStart>`, `›` to `?week=<nextSunday>`. Below: a horizontally-scrollable flex row (`flex gap-2 overflow-x-auto`) of 7 day-columns (`min-w-[8rem]`), each: weekday + date header, then its instances as cards (`start–end` · location · `assigned/headcount`, ⚠ amber when `assigned<headcount && status!=='cancelled'`, line-through when cancelled), each card a `<Link href={`/admin/shifts/instances/${id}`}>`. Top buttons: **+ New shift** → `/admin/shifts/new`, **Templates** → `/admin/shifts/templates`.
- [ ] **Step 3: Verify** typecheck + build.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): /admin/shifts week grid + week nav"`

---

### Task 4: `/admin/shifts/new` (add template) + `/admin/shifts/templates` (list)
**Files:** Create `packages/web/app/admin/shifts/new/page.tsx` + `new/add-template-form.tsx`; create `packages/web/app/admin/shifts/templates/page.tsx`. Delete the old `packages/web/app/admin/shifts/shifts-admin.tsx` once its add-template form is moved here (and confirm nothing else imports it).

- [ ] **Step 1: `/admin/shifts/new`** — server page `requireAdmin`; load `loadActivePlaces`; render `<AddTemplateForm places={...} />`. The form is the add-template form extracted from the old `shifts-admin.tsx` (location select, weekday checkboxes, start/end, headcount, rate, valid-from/to) POSTing to the existing `POST /api/admin/shifts`; on success `router.push('/admin/shifts')`.
- [ ] **Step 2: `/admin/shifts/templates`** — server page `requireAdmin`; `listTemplates`; render a list: each template row `location · label · days.join(',') · start–end · ×headcount · (active?)` as a `<Link href={`/admin/shifts/templates/${t.id}`}>`. A **+ New shift** link to `/admin/shifts/new`.
- [ ] **Step 3: Verify** typecheck + build (`/admin/shifts/new`, `/admin/shifts/templates` present; old shifts-admin.tsx removed without breakage).
- [ ] **Step 4: Commit.** `git commit -m "feat(web): /admin/shifts/new + /admin/shifts/templates pages"`

---

### Task 5: `/admin/shifts/templates/[id]` — template detail (edit + assign + copy + instances)
**Files:** Create `packages/web/app/admin/shifts/templates/[id]/page.tsx` + `template-detail.tsx`.

- [ ] **Step 1: page** — `requireAdmin`; load the template (`listTemplates`→find by id; 404 via `notFound()` if missing), `loadActivePlaces`, `listWorkers`, the template's `listRecurring`, and its upcoming instances (`listInstances({from:today,to:today+42})` filtered to `i.id.startsWith(id+'_')` with assigned counts from one `listAssignments({})` read). Pass to `<TemplateDetail/>`.
- [ ] **Step 2: `template-detail.tsx`** (`'use client'`) — three sections:
  - **Edit** form (prefilled from the template): weekday checkboxes, start/end, headcount, rate, valid-from/to, location select → POSTs to `/api/admin/shifts/[id]`; on success `router.refresh()`.
  - **Recurring assignments** editor (reuse the pattern from the old `shifts-admin.tsx` RecurringEditor — add/remove employees, members-first select, soft warning) → POSTs to `/api/admin/shift-assignments`.
  - **Copy to period**: from/to date inputs + a "carry assignments" checkbox + Copy button → POSTs to `/api/admin/shifts/copy` with `{templateId:id, validFrom, validTo, carryAssignments}`; on success navigate to the new template or `/admin/shifts`.
  - **Upcoming instances**: read-only list (date · time · assigned/headcount · needs-staff), each linking to `/admin/shifts/instances/[id]`.
- [ ] **Step 3: Verify** typecheck + build.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): template detail — edit, assign, copy-to-period, instances"`

---

### Task 6: `/admin/shifts/instances/[id]` — single-instance editor
**Files:** Create `packages/web/app/admin/shifts/instances/[id]/page.tsx` + `instance-detail.tsx`.

- [ ] **Step 1: page** — `requireAdmin`; load the instance (filter `listInstances` over a wide range, or read the row by id — simplest: `listInstances({from:'0000-01-01',to:'9999-12-31'})` then find by id; `notFound()` if missing), its assignments (`listAssignments({instanceId:id})`), and `listWorkers` for the add-assignment picker. Pass to `<InstanceDetail/>`.
- [ ] **Step 2: `instance-detail.tsx`** (`'use client'`) — shows location/date/time/headcount; an **edit** form (date, start, end, headcount) → POST `/api/admin/shift-instances/[id]` `{action:'update',...}`; a **Cancel shift** button → `{action:'cancel'}` (confirm first); an **assignments** list with remove buttons + an add-employee picker → `{action:'assign'|'remove', phone}`. `router.refresh()` after each.
- [ ] **Step 3: Verify** typecheck + build.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): single-instance editor (retime, cancel, assign)"`

---

## Self-Review Notes
- **Spec coverage:** separate pages (T3–T6), week grid (T3), template edit→regen (T1 `applyTemplateEdit` + T2 route), per-instance edit (T1 `updateInstance` + T6), copy-to-period carrying assignments (T1 `copyTemplate` + T2 route + T5 UI), awaited regen (T2). Recurring-assignment editor preserved (T5).
- **Perf:** week grid + detail batch one `listAssignments({})` read and count in memory (no N+1) — Global Constraints.
- **Type consistency:** `updateInstance`/`applyTemplateEdit`/`copyTemplate` (T1) consumed by T2 routes; pages consume existing `listInstances`/`listTemplates`/`listRecurring`/`listAssignments`/`listWorkers`.
- **Cleanup:** old `shifts-admin.tsx` deleted in T4 after its parts are redistributed.
