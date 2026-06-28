# F2 — City Dropdown (managed list) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** City becomes a dropdown from a managed list (a `Cities` sheet tab the PM edits + distinct existing worker cities), so the same city isn't entered three ways (בת ים/בת-ים). PM item 1.3.

**Tech Stack:** TypeScript, Next.js 15 App Router, Google Sheets, Node test runner.

## Global Constraints
- worklog-core ESM `.ts` imports; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; verify typecheck + build.
- The `Cities` tab is sheet-managed (PM adds special cities like Krayot there). The gateway already returns `[]` for a missing tab, so an absent Cities tab is fine. Admin-guarded forms. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: `loadCities` data layer
**Files:** Create `packages/worklog-core/src/data/cities.ts` + `cities.test.ts`; export from `index.ts`.

**Interfaces — Produces:** `loadCities(gateway): Promise<string[]>` — union of the `Cities` tab (`city_name` column) and distinct non-blank `Workers.city` values, deduped + sorted.

- [ ] **Step 1: Failing test** `cities.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { loadCities } from './cities.ts';
test('merges Cities tab + distinct worker cities, deduped + sorted', async () => {
  const g = createMemoryGateway({
    Cities: [['city_name'], ['Tel Aviv'], ['Haifa']],
    Workers: [['phone','city'], ['1','Tel Aviv'], ['2','Bat Yam'], ['3','']],
  });
  assert.deepEqual(await loadCities(g), ['Bat Yam', 'Haifa', 'Tel Aviv']);
});
test('empty Cities tab → falls back to worker cities', async () => {
  const g = createMemoryGateway({ Workers: [['phone','city'], ['1','Lod']] });
  assert.deepEqual(await loadCities(g), ['Lod']);
});
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement `cities.ts`:**
```ts
import { rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
export async function loadCities(gateway: SheetsGateway): Promise<string[]> {
  const set = new Set<string>();
  for (const o of rowsToObjects(await gateway.readTab('Cities'))) {
    const c = (o.city_name ?? '').trim();
    if (c) set.add(c);
  }
  for (const o of rowsToObjects(await gateway.readTab('Workers'))) {
    const c = (o.city ?? '').trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 4: Export** `loadCities` from `index.ts`.
- [ ] **Step 5: Run — pass + typecheck.**
- [ ] **Step 6: Commit.** `git commit -m "feat(core): loadCities (managed Cities tab + worker cities)"`

---

### Task 2: City `<select>` in add-worker + worker-card
**Files:** `packages/web/app/admin/add/page.tsx` + `add/add-worker-form.tsx`; `packages/web/app/admin/workers/[phone]/page.tsx` + `[phone]/worker-card.tsx`.

- [ ] **Step 1: add-worker** — page loads `loadCities(getRequestGateway())` and passes a `cities: string[]` prop to `<AddWorkerForm>`. In the form, replace the free-text `city` input with a `<select>` (`Choose…` + each city). Keep storing the chosen string.
- [ ] **Step 2: worker-card** — page loads `loadCities` and passes `cities`. In `worker-card.tsx`, the `city` field becomes a `<select>` from `cities`; **ensure the worker's current `city` is in the options** (prepend it if not present, so an existing/legacy city isn't lost on edit). Keep posting the chosen value.
- [ ] **Step 3: Verify** typecheck + build.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): city dropdown (managed list) in add-worker + worker card"`

---

## Self-Review Notes
- **Coverage:** loadCities (T1) + city dropdown in both worker forms (T2). PM adds special cities via the `Cities` sheet tab; existing cities still appear (worker-city fallback). Worker-card includes the current city so edits don't drop legacy values.
- The admin **filter** city control already lists distinct worker cities — unchanged.
