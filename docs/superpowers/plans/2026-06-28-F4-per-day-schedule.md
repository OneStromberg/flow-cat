# F4 — Per-day Weekly Times + Recurrence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** A shift template can set a **different start–end per weekday** (Sun–Thu 9–19, Fri 8–15, Sat 19–22), with recurrence **Forever / N weeks / From–to**. PM item 2.1.

**Architecture:** Add a `day_times` column + a `dayTimes: DayTime[]` field on `ShiftTemplate`. `AddTemplateInput.dayTimes` is **optional** — when present it's authoritative; when absent the legacy `days`/`start`/`end` derive into `dayTimes`, so **existing templates and callers keep working unchanged**. The generator + `applyTemplateEdit` read per-day times from `dayTimes`. Recurrence is UI sugar over `valid_from`/`valid_to`.

**Tech Stack:** TypeScript, Next.js 15 App Router, Google Sheets, Node test runner.

## Global Constraints
- worklog-core ESM `.ts` imports; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; verify typecheck + build.
- `gateway.updateRow` 1-based. Weekday via `Date.UTC` (existing `weekday` helper). `WEEKDAYS`/`WD` unchanged.
- **Backward-compat is mandatory:** legacy templates (no `day_times`) must generate exactly as before; existing callers (copyTemplate, integration test) that pass `days`/`start`/`end` must still compile + work.
- Admin-guarded. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: `dayTimes` on ShiftTemplate (model + parse + validate + record)
**Files:** `packages/worklog-core/src/data/shift-templates.ts`; `shift-templates.test.ts`; export `DayTime` from `index.ts`.

**Interfaces — Produces:**
```ts
interface DayTime { day: string; start: string; end: string }
// ShiftTemplate gains:  dayTimes: DayTime[]
// AddTemplateInput gains (optional):  dayTimes?: DayTime[]
```
Serialized column `day_times` format: `Sun=09:00-19:00;Mon=09:00-19:00;Fri=08:00-15:00` (`;`-separated `Day=HH:MM-HH:MM`).

- [ ] **Step 1: Failing tests** in `shift-templates.test.ts`:
```ts
test('parseTemplate derives dayTimes from legacy days+start+end', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [
    ['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions'],
    ['t1','A','Day','Mon,Wed','08:00','16:00','1','','','yes','',''],
  ]});
  const t = (await listTemplates(g))[0];
  assert.deepEqual(t.dayTimes, [{day:'Mon',start:'08:00',end:'16:00'},{day:'Wed',start:'08:00',end:'16:00'}]);
});
test('addTemplate with per-day dayTimes serializes day_times and round-trips', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions','day_times']] });
  const r = await addTemplate(g, { location:'A', label:'Day', days:[], start:'', end:'', headcount:'1', validFrom:'', validTo:'', rate:'', instructions:'',
    dayTimes:[{day:'Sun',start:'09:00',end:'19:00'},{day:'Fri',start:'08:00',end:'15:00'}] });
  assert.equal(r.ok, true);
  const t = (await listTemplates(g))[0];
  assert.deepEqual(t.dayTimes, [{day:'Sun',start:'09:00',end:'19:00'},{day:'Fri',start:'08:00',end:'15:00'}]);
  assert.deepEqual(t.days, ['Sun','Fri']); // derived
});
test('addTemplate rejects an invalid per-day time', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions','day_times']] });
  const r = await addTemplate(g, { location:'A', label:'D', days:[], start:'', end:'', headcount:'1', validFrom:'', validTo:'', rate:'', instructions:'',
    dayTimes:[{day:'Sun',start:'25:00',end:'19:00'}] });
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement** in `shift-templates.ts`:
  - `export interface DayTime { day: string; start: string; end: string }`.
  - `TEMPLATE_COLUMNS` append `'day_times'`.
  - Serialize helper: `const serializeDayTimes = (dts: DayTime[]) => dts.map(d => `${d.day}=${d.start}-${d.end}`).join(';');`
  - Parse helper: `parseDayTimes(s)` → split `;`, each `Day=HH:MM-HH:MM` → `{day,start,end}`, drop malformed.
  - `parseTemplate`: compute `dayTimes` = `o.day_times` non-empty ? `parseDayTimes(o.day_times)` : `days.map(day => ({day, start, end}))` (legacy derive from the already-parsed `days`/`start`/`end`). Set `days = dayTimes.map(d=>d.day)` for consistency; keep `start`/`end` as the row's (or `dayTimes[0]`). Add `dayTimes` to the returned object.
  - `AddTemplateInput`: add `dayTimes?: DayTime[]`.
  - In `validate(input)`: if `input.dayTimes?.length`, validate each entry's `day ∈ WEEKDAYS`, `start`/`end` match `TIME_RE`, `start !== end`; set `errors.days` if the array is empty-after-filter. ELSE keep the existing `days`/`start`/`end` validation (legacy path).
  - In `recordOf(id, input)`: compute the effective dayTimes = `input.dayTimes?.length ? input.dayTimes : input.days.map(d => ({day:d, start:input.start, end:input.end}))`. Write `day_times: serializeDayTimes(effective)`, `days: effective.map(d=>d.day).join(',')`, `start: effective[0]?.start ?? ''`, `end: effective[0]?.end ?? ''` (back-compat), plus the existing fields.
- [ ] **Step 4: Export** `DayTime` from `index.ts`.
- [ ] **Step 5: Run — pass + typecheck** (existing template tests must still pass — legacy callers unaffected).
- [ ] **Step 6: Commit.** `git commit -m "feat(core): per-day shift times (dayTimes) with legacy derivation"`

---

### Task 2: Generator + applyTemplateEdit use per-day times
**Files:** `packages/worklog-core/src/data/shift-instances.ts`; `shift-instances.test.ts`.

- [ ] **Step 1: Failing test** — a template with different times per day produces per-day instance times; legacy still works:
```ts
test('generateInstances uses per-day times', async () => {
  const g = createMemoryGateway({
    ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions','day_times'],
      ['t1','A','Day','Wed,Fri','09:00','19:00','1','','','yes','','','Wed=09:00-19:00;Fri=08:00-15:00']],
    RecurringAssignments: [['template_id','employee_phone','active','created_at']],
    ShiftInstances: [['id','template_id','location','date','start','end','headcount','status','generated_at']],
    ShiftAssignments: [['instance_id','employee_phone','source','status','assigned_at','assigned_by']],
  });
  await generateInstances(g, '2026-07-01', 7); // Wed 07-01, Fri 07-03
  const ins = await listInstances(g, { from:'2026-07-01', to:'2026-07-10' });
  const wed = ins.find(i=>i.date==='2026-07-01'); const fri = ins.find(i=>i.date==='2026-07-03');
  assert.equal(wed?.start, '09:00'); assert.equal(wed?.end, '19:00');
  assert.equal(fri?.start, '08:00'); assert.equal(fri?.end, '15:00');
});
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement.** In `generateInstances`, replace the per-date day/time logic: build `const dayMap = new Map(tpl.dayTimes.map(d => [d.day, d]))`. For each date: `const wd = weekday(date); const dt = dayMap.get(wd); if (!dt) continue;` then create the instance with `start: dt.start, end: dt.end` (instead of `tpl.start`/`tpl.end`). The valid-range/idempotency/seeding logic is UNCHANGED. Do the same in `applyTemplateEdit` (use the per-day `start`/`end` when updating a future instance; cancel when the weekday isn't in `dayMap`).
- [ ] **Step 4: Run — pass + typecheck** (the existing generator tests — legacy templates with no `day_times` — still pass because `parseTemplate` derives `dayTimes` from `days`+`start`+`end`).
- [ ] **Step 5: Commit.** `git commit -m "feat(core): generator + applyTemplateEdit honor per-day shift times"`

---

### Task 3: copyTemplate + routes carry dayTimes
**Files:** `packages/worklog-core/src/data/shift-templates.ts` (`copyTemplate`); `packages/web/app/api/admin/shifts/route.ts`, `app/api/admin/shifts/[id]/route.ts`.

- [ ] **Step 1: copyTemplate** — pass `dayTimes: src.dayTimes` into its `addTemplate` call (so the copy preserves per-day times). (The other fields it already copies.)
- [ ] **Step 2: Routes** — both shift routes: coerce `dayTimes` from the body when present: `dayTimes: Array.isArray(b.dayTimes) ? (b.dayTimes as any[]).map(d => ({ day: str(d.day), start: str(d.start), end: str(d.end) })).filter(d=>d.day) : undefined`, and include it in the `AddTemplateInput`. (Keep coercing the legacy `days`/`start`/`end` too, so a body with either shape works.)
- [ ] **Step 3: Verify** worklog-core tests + web typecheck + build.
- [ ] **Step 4: Commit.** `git commit -m "feat: copyTemplate + shift routes carry per-day times"`

---

### Task 4: Add-template form — per-day grid + recurrence picker
**Files:** `packages/web/app/admin/shifts/new/add-template-form.tsx`.

- [ ] **Step 1:** Replace the single start/end + weekday checkboxes with a **7-row weekday grid** (Sun, Mon, Tue, Wed, Thu, Fri, Sat): each row = an on/off checkbox + `<input type="time">` start + end (disabled until the row is on). State: `Record<weekday, {on:boolean; start:string; end:string}>`. A small "apply to all enabled days" convenience (optional): a default start/end pair + an "apply" button that fills enabled rows.
- [ ] **Step 2: Recurrence picker:** a mode `<select>` — **Forever** / **N weeks** / **From–to**. State drives `validFrom`/`validTo`:
  - Forever → `validFrom = startDate (default today)`, `validTo = ''`.
  - N weeks → an `N` number input + a start-date input; `validFrom = startDate`, `validTo = addDays(startDate, N*7 - 1)` (compute with a small inline helper).
  - From–to → two date inputs → `validFrom`/`validTo` directly.
- [ ] **Step 3: Submit** — build `dayTimes` = the enabled rows mapped to `{day,start,end}`; POST `{ location, label, headcount, rate, instructions, validFrom, validTo, dayTimes }` (omit/blank `days`/`start`/`end` — the backend derives from dayTimes) to `/api/admin/shifts`; show field errors; on success `router.push('/admin/shifts')`. Require ≥1 enabled day with valid times.
- [ ] **Step 4: Verify** typecheck + build.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): per-day times + recurrence on the add-template form"`

---

### Task 5: Edit form (template detail) — per-day grid + recurrence
**Files:** `packages/web/app/admin/shifts/templates/[id]/template-detail.tsx`.

- [ ] **Step 1:** Replace the edit form's single start/end + weekday checkboxes with the SAME per-day weekday grid + recurrence picker (as Task 4), **prefilled** from `template.dayTimes` (rows on for days present, with their times) and the template's `validFrom`/`validTo` (default the recurrence mode: `validTo` empty → Forever, else From–to). Submit posts `dayTimes` + `validFrom`/`validTo` (+ label/headcount/rate/instructions/location) to `/api/admin/shifts/${template.id}`; `router.refresh()` on success. (Keep the recurring-assignment editor, copy-to-location, and instances sections unchanged.)
- [ ] **Step 2: Verify** typecheck + build.
- [ ] **Step 3: Commit.** `git commit -m "feat(web): per-day times + recurrence on the template edit form"`

---

## Self-Review Notes
- **Backward-compat:** `dayTimes` optional on input; `parseTemplate` derives it from legacy `days`+`start`+`end`; existing tests (incl. the integration test + copyTemplate) pass unchanged because they use the legacy fields. The generator reads `dayTimes`, which is always populated.
- **Generator safety:** only the per-date time source changes (dayMap lookup); idempotency (deterministic ids), valid-range clipping, and recurring seeding are untouched — Task 2 test confirms per-day times; existing generator tests confirm no regression.
- **Recurrence** stays `valid_from`/`valid_to`; the modes are form-side computation.
- **Type consistency:** `DayTime` + `AddTemplateInput.dayTimes?` (T1) consumed by generator (T2), copyTemplate + routes (T3), both forms (T4/T5).
