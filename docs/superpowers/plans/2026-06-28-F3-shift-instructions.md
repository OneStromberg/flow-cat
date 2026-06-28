# F3 — Shift Instructions / Roles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Each shift template gets an `instructions` field (the per-role task description — Guard 1 / Guard 2 / Sayar, where the `label` is the role name). Instructions are shown to the assigned worker and in the admin shift detail. PM item 2.5.

**Tech Stack:** TypeScript, Next.js 15 App Router, Google Sheets, Node test runner.

## Global Constraints
- worklog-core ESM `.ts` imports; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; verify typecheck + build.
- Adding a free-text field; mirror the existing `rate` field on ShiftTemplate. Admin-guarded. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: `instructions` on ShiftTemplate + admin forms/route
**Files:** `packages/worklog-core/src/data/shift-templates.ts` (interface + parse + recordOf + TEMPLATE_COLUMNS); `shift-templates.test.ts`; `index.ts` (type already exported); web: `app/api/admin/shifts/route.ts`, `app/api/admin/shifts/[id]/route.ts`, `app/admin/shifts/new/add-template-form.tsx`, `app/admin/shifts/templates/[id]/template-detail.tsx`.

- [ ] **Step 1: Failing test** in `shift-templates.test.ts`:
```ts
test('addTemplate stores instructions; round-trips', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions']] });
  const r = await addTemplate(g, { location:'Site A', label:'Guard 1', days:['Sun'], start:'09:00', end:'19:00', headcount:'1', validFrom:'', validTo:'', rate:'', instructions:'Patrol the perimeter hourly. Log entries.' });
  assert.equal(r.ok, true);
  const t = (await listTemplates(g))[0];
  assert.equal(t.instructions, 'Patrol the perimeter hourly. Log entries.');
});
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement** in `shift-templates.ts`:
  - `ShiftTemplate` gains `instructions: string`; `AddTemplateInput` gains `instructions: string`.
  - `TEMPLATE_COLUMNS` append `'instructions'`.
  - `parseTemplate` add `instructions: (o.instructions ?? '').trim()`.
  - `recordOf` add `instructions: input.instructions.trim()`.
- [ ] **Step 4: Web carriers** (so the new REQUIRED `AddTemplateInput.instructions` keeps the build green):
  - `api/admin/shifts/route.ts` + `api/admin/shifts/[id]/route.ts`: add `instructions: str(b.instructions)` to the coerced input.
  - `new/add-template-form.tsx`: add an `instructions` `<textarea>` (label "Instructions (tasks for this role)"), include in FORM state + POST body.
  - `templates/[id]/template-detail.tsx`: add the same `instructions` `<textarea>` to the edit form, prefilled from `template.instructions`, included in the POST body.
  READ each file first.
- [ ] **Step 5: Run** worklog-core tests + web typecheck + build.
- [ ] **Step 6: Commit.** `git commit -m "feat: shift template instructions field (per-role tasks)"`

---

### Task 2: Show instructions to the worker (+ admin instance detail)
**Files:** `packages/web/app/app/checkin/page.tsx` + `checkin-client.tsx`; `packages/web/app/admin/shifts/instances/[id]/page.tsx` + `instance-detail.tsx`.

- [ ] **Step 1: Worker check-in** — in `checkin/page.tsx`, load `listTemplates(gw)` and map `instanceId`'s template (`instance.templateId → template.instructions` and `template.label`). Pass `instructions` + `role` (the label) per item to `<CheckinClient>`. In `checkin-client.tsx`, under each shift's location/time, show the **role** (label) and, when non-empty, an **Instructions** block (`whitespace-pre-wrap text-sm`) so the worker sees their tasks.
- [ ] **Step 2: Admin instance detail** — in `instances/[id]/page.tsx`, load the instance's template (via `listTemplates` → find by `instance.templateId`) and pass `instructions` + `label`; in `instance-detail.tsx`, show the role + instructions (read-only) near the top.
- [ ] **Step 3: Verify** typecheck + build.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): show shift role + instructions to worker and on instance detail"`

---

## Self-Review Notes
- **Coverage:** instructions field (T1) + worker/admin visibility (T2). Role = existing `label`.
- **Type consistency:** `AddTemplateInput.instructions` (T1) consumed by both shift routes + both forms; `ShiftTemplate.instructions` read on the worker/admin pages.
- Mirrors the prior `rate`-field addition exactly (same touch-points).
