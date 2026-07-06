# PM Batch 5 — Phase C2 (multi-shift-per-day templates) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Templates can define 2+ shifts on the same weekday (spec: `docs/superpowers/specs/2026-07-06-pm-batch5-phaseC2-multishift-design.md`).

## Global Constraints
- worklog-core ESM `.ts`; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; `pnpm --filter @scourage/web typecheck && build`.
- `updateRow` 1-based. Instance idempotency is by composite `template_id|date|start` (survives the id-scheme change). Commit author = OneStromberg; LOCAL commits. ponytail.

---

### Task 1: multi-slot generation + composite idempotency
**Files:** `packages/worklog-core/src/data/shift-instances.ts` (`generateInstances` + `seedTemplateInstances`); test `shift-instances.test.ts`.

Today both use `const dayMap = new Map(tpl.dayTimes.map((d) => [d.day, d]))` then `dayMap.get(wd)` (ONE slot/day), and instance id `${tpl.id}_${compact(date)}` (collides for two same-day slots).

- [ ] **Step 1:** Read `generateInstances` (~174-300) and `seedTemplateInstances` (added in Phase A). Note where they build `existingIds` (a Set of instance id strings) and the per-day loop.
- [ ] **Step 2: Failing test** — a template with TWO Monday slots (06:00-14:00 and 14:00-22:00), generate over a horizon covering a Monday → expect TWO instances for that date (distinct ids incl. start). And composite idempotency: seed an EXISTING old-format instance (`t1_<compactDate>`, start `06:00`) then generate → it must NOT be duplicated (the 06:00 slot recognizes it by `template_id|date|start`); only the 14:00 slot is created.
```ts
test('generateInstances creates one instance per same-day slot; composite-idempotent vs old id format', async () => {
  // ShiftTemplates: t1 active, day_times 'mon=06:00-14:00;mon=14:00-22:00', headcount 1
  // ShiftInstances: pre-seed ['t1_20260706','t1','Site A','2026-07-06','06:00','14:00','1','scheduled',''] (OLD id format, 06:00 slot)
  // today chosen so 2026-07-06 (a Monday) is in horizon
  const g = /* createMemoryGateway with the above + empty ShiftAssignments */;
  await generateInstances(g, '2026-07-06', 7);
  const inst = rowsToObjects(g.dump()['ShiftInstances']).filter((o) => o.template_id === 't1' && o.date === '2026-07-06');
  const starts = inst.map((o) => o.start).sort();
  assert.deepEqual(starts, ['06:00','14:00']); // exactly two, no duplicate 06:00
});
```
(Confirm `2026-07-06` is a Monday and matches how `weekday()` names days; adjust the `day` token to match the codebase's weekday format e.g. 'mon'/'monday'.)
- [ ] **Step 3: Run — fail** (currently collapses to one slot + would duplicate the old-format 06:00).
- [ ] **Step 4: Implement** in BOTH `generateInstances` and `seedTemplateInstances`:
  - Replace the `dayMap`/`dayMap.get(wd)` single-slot logic with: `const slots = tpl.dayTimes.filter((d) => d.day === wd);` then loop over `slots`.
  - For each slot: `const instanceId = \`${tpl.id}_${compact(date)}_${slot.start.replace(':','')}\`;`.
  - Change idempotency from an id-string Set to a **composite** Set/Map keyed `\`${template_id}|${date}|${start}\`` built from ALL existing `ShiftInstances` rows (so old-format ids are recognized by their template_id+date+start). Create the instance only if its composite key is absent. Keep the assignment-seeding + `existingAssignKeys` logic per created/existing instance (seed recurring into each slot's instance; look up the instance's real id — for an EXISTING old-format instance, use its actual id from the row, not the recomputed new one, so assignments attach to the right instance).
  - IMPORTANT: when an instance already exists (old or new id), seed recurring assignments against its ACTUAL existing id (read from the sheet), not the recomputed id. Build a `compositeKey → existingInstanceId` map.
- [ ] **Step 5: Run — pass; existing generate/seed tests still pass** (single-slot templates unaffected — one slot/day still yields one instance; its id now has a start suffix for NEW instances, but existing single-slot tests that pre-seed instances rely on composite idempotency — verify/adjust those tests only if they asserted the exact id string). `tsc --noEmit` clean.
- [ ] **Step 6: Commit.** `git commit -m "feat(core): multi-shift-per-day generation + composite idempotency (feat 3)"`

---

### Task 2: `applyTemplateEdit` matches instances to slots by start
**Files:** `packages/worklog-core/src/data/shift-instances.ts` (`applyTemplateEdit`); test.

Today `applyTemplateEdit` uses `dayMap.get(wd)` (one slot) to update each future scheduled instance's time. With multiple slots it must match each instance to the RIGHT slot.

- [ ] **Step 1:** Read `applyTemplateEdit` (~115-161 / 300-330). It iterates future scheduled instances of the template and updates their start/end/headcount from the template's slot for that weekday.
- [ ] **Step 2: Failing test** — a template with two Monday slots; two existing Monday instances (starts 06:00 and 14:00); edit the template so the 14:00 slot's END changes (e.g. →23:00). After `applyTemplateEdit`, the 06:00 instance is unchanged and the 14:00 instance's end is updated; neither is cross-contaminated.
- [ ] **Step 3: Run — fail.**
- [ ] **Step 4: Implement:** for each future scheduled instance, find the template slot for its weekday whose `start === instance.start` (match by stored start). If found, update end/headcount to that slot's values (keep start). If NO slot matches the instance's start (the admin changed/removed that slot), leave the instance untouched (generation will create the new-start slot; the stale one can be cancelled by the admin — do NOT guess-reassign). Multi-slot-safe.
- [ ] **Step 5: Run — pass + existing applyTemplateEdit tests pass** (single-slot: the one slot matches the instance's start as before). `tsc` clean.
- [ ] **Step 6: Commit.** `git commit -m "feat(core): applyTemplateEdit slot-matches by start (multi-shift-safe)"`

---

### Task 3: template editor — multiple time rows per day
**Files:** `packages/web/app/admin/shifts/new/add-template-form.tsx` and the edit form in `packages/web/app/admin/shifts/templates/[id]/template-detail.tsx`.

- [ ] **Step 1:** Read both forms — how they collect per-day times and build `dayTimes: DayTime[]` for the POST. Identify where a day's start/end is entered.
- [ ] **Step 2:** Change the per-day time entry so a day can have **multiple `{start,end}` slots**: for each selected day, render its slot rows with an **"+ add another shift"** control and a remove control per extra slot. On submit, emit `dayTimes` with one entry per (day, slot) — repeats of the same `day` are expected and valid (the serializer already handles `day=start-end;day=start2-end2`). Keep the single-slot default (a day starts with one slot row). Match the existing form styling.
- [ ] **Step 3:** `pnpm --filter @scourage/web typecheck && build` → pass. Manually confirm (by reading) the built `dayTimes` payload can contain two entries for one day.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): template editor supports 2+ shifts per day (feat 3)"`

---

## Self-Review Notes
- **Coverage:** feat3 → T1 (generation) + T2 (edit propagation) + T3 (editor UI).
- **Migration safety:** composite `(template_id,date,start)` idempotency means existing old-id instances are not duplicated; assignments seed against the real existing id.
- **Ordering:** T1 → T2 (both core, T2 builds on the slot concept). T3 web, independent but needs T1's data shape.
- **Known limitation:** editing a slot's START leaves the old instance stale (admin cancels) — noted in spec.
