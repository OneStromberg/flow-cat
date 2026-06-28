# Conflict Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Detect when a worker is assigned to **time-overlapping** shift instances (can't be in two places at once) and surface them — a `/admin/conflicts` review page + a soft warning when assigning. Roadmap §14 (overlap; leave-conflict deferred until Phase-5 leave exists).

**Tech Stack:** TypeScript, Next.js 15 App Router, Google Sheets, Node test runner.

## Global Constraints
- worklog-core ESM `.ts` imports; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; verify typecheck + build.
- Overlap uses absolute datetimes (overnight: end<start ⇒ next day). Batch reads (no N+1). Admin-guarded. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: Conflict-detection data layer
**Files:** Create `packages/worklog-core/src/data/conflicts.ts` + `conflicts.test.ts`; export from `index.ts`.

**Interfaces — Produces:**
```ts
interface ShiftWindow { id: string; date: string; start: string; end: string }
instancesOverlap(a: ShiftWindow, b: ShiftWindow): boolean   // absolute-time overlap, overnight-aware
interface Conflict { employeePhone: string; a: ShiftWindow; b: ShiftWindow }
findConflicts(gateway, { from: string; to: string }): Promise<Conflict[]>
```

- [ ] **Step 1: Failing tests** `conflicts.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { instancesOverlap, findConflicts } from './conflicts.ts';

test('instancesOverlap: same-day overlap, adjacency, overnight', () => {
  const w = (id:string,date:string,start:string,end:string) => ({id,date,start,end});
  assert.equal(instancesOverlap(w('a','2026-07-01','09:00','17:00'), w('b','2026-07-01','14:00','22:00')), true);  // overlap
  assert.equal(instancesOverlap(w('a','2026-07-01','09:00','17:00'), w('b','2026-07-01','17:00','22:00')), false); // touch, no overlap
  assert.equal(instancesOverlap(w('a','2026-07-01','22:00','06:00'), w('b','2026-07-02','05:00','09:00')), true);  // overnight crosses into next day
  assert.equal(instancesOverlap(w('a','2026-07-01','09:00','17:00'), w('b','2026-07-02','09:00','17:00')), false); // different days
});

test('findConflicts: a worker double-booked on overlapping instances', async () => {
  const g = createMemoryGateway({
    ShiftInstances: [['id','template_id','location','date','start','end','headcount','status','generated_at'],
      ['i1','t1','Site A','2026-07-01','09:00','17:00','1','scheduled',''],
      ['i2','t2','Site B','2026-07-01','14:00','22:00','1','scheduled',''],
      ['i3','t3','Site C','2026-07-02','09:00','17:00','1','scheduled','']],
    ShiftAssignments: [['instance_id','employee_phone','source','status','assigned_at','assigned_by'],
      ['i1','972501234567','manual','assigned','',''],
      ['i2','972501234567','manual','assigned','',''],   // overlaps i1 → conflict
      ['i3','972501234567','manual','assigned','','']],   // different day → no conflict
  });
  const cs = await findConflicts(g, { from:'2026-07-01', to:'2026-07-31' });
  assert.equal(cs.length, 1);
  assert.equal(cs[0].employeePhone, '972501234567');
  assert.deepEqual([cs[0].a.id, cs[0].b.id].sort(), ['i1','i2']);
});
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement `conflicts.ts`:**
```ts
import { rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
export interface ShiftWindow { id: string; date: string; start: string; end: string }
export interface Conflict { employeePhone: string; a: ShiftWindow; b: ShiftWindow }

function nextDay(iso: string): string {
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m-1, d+1)).toISOString().slice(0,10);
}
function startMs(w: ShiftWindow): number { return Date.parse(`${w.date}T${w.start}:00Z`); }
function endMs(w: ShiftWindow): number {
  const day = w.end < w.start ? nextDay(w.date) : w.date;
  return Date.parse(`${day}T${w.end}:00Z`);
}
export function instancesOverlap(a: ShiftWindow, b: ShiftWindow): boolean {
  const aS = startMs(a), aE = endMs(a), bS = startMs(b), bE = endMs(b);
  if (![aS,aE,bS,bE].every(Number.isFinite)) return false;
  return aS < bE && bS < aE; // strict: touching endpoints don't overlap
}
export async function findConflicts(gateway: SheetsGateway, range: { from: string; to: string }): Promise<Conflict[]> {
  const instById = new Map<string, ShiftWindow>();
  for (const o of rowsToObjects(await gateway.readTab('ShiftInstances'))) {
    const id = (o.id ?? '').trim(); const date = (o.date ?? '').trim();
    if (!id || date < range.from || date > range.to) continue;
    if ((o.status ?? '').trim() === 'cancelled') continue;
    instById.set(id, { id, date, start: (o.start ?? '').trim(), end: (o.end ?? '').trim() });
  }
  // worker → their assigned instance windows (status=assigned, in range)
  const byWorker = new Map<string, ShiftWindow[]>();
  for (const o of rowsToObjects(await gateway.readTab('ShiftAssignments'))) {
    if ((o.status ?? '').trim() !== 'assigned') continue;
    const w = instById.get((o.instance_id ?? '').trim());
    const ph = (o.employee_phone ?? '').trim();
    if (!w || !ph) continue;
    (byWorker.get(ph) ?? byWorker.set(ph, []).get(ph)!).push(w);
  }
  const out: Conflict[] = [];
  for (const [ph, wins] of byWorker) {
    for (let i = 0; i < wins.length; i++)
      for (let j = i+1; j < wins.length; j++)
        if (instancesOverlap(wins[i], wins[j])) out.push({ employeePhone: ph, a: wins[i], b: wins[j] });
  }
  return out;
}
```

- [ ] **Step 4: Export** `instancesOverlap, findConflicts, type ShiftWindow, type Conflict` from `index.ts`.
- [ ] **Step 5: Run — pass + typecheck.**
- [ ] **Step 6: Commit.** `git commit -m "feat(core): conflict detection (worker double-booked on overlapping shifts)"`

---

### Task 2: `/admin/conflicts` page + nav + inline warning
**Files:** Create `packages/web/app/admin/conflicts/page.tsx` + a client/list; add a "Conflicts" entry to the admin nav (or a badge); (optional) a soft warning in the instance-detail assign flow.

- [ ] **Step 1: Page** `/admin/conflicts` — `requireAdmin`→redirect. Default range = today … today+42 (a `?from=&to=` overrideable). Load `findConflicts(getRequestGateway(), {from,to})` + `listWorkers` (phone→name) + `listInstances` (id→location). Render a list: each conflict → **worker name** · **date** · the two shifts (`location · start–end`) with links to each instance (`/admin/shifts/instances/<id>`), styled as a red/amber warning card. Empty → "No conflicts in this range ✓". `runtime='nodejs'`,`dynamic='force-dynamic'`.
- [ ] **Step 2: Nav** — add a **Conflicts** tab to `admin-nav.tsx` (6 tabs now: Workers · Shifts · Places · Attendance · Payroll · Conflicts; keep them readable on mobile — emoji ⚠ + label; if 6 is too tight, it's acceptable to put Conflicts as a link on the Shifts week view header instead — implementer's call, but it MUST be reachable).
- [ ] **Step 3: Verify** typecheck + build (`/admin/conflicts` present).
- [ ] **Step 4: Commit.** `git commit -m "feat(web): /admin/conflicts review page"`

---

## Self-Review Notes
- **Coverage:** overlap logic (T1, tested incl. overnight + adjacency) + conflicts page (T2). Leave-based conflicts deferred to Phase-5 leave.
- **Perf:** findConflicts batches 2 reads; the page adds workers + instances (in-memory joins). No per-instance reads.
- **Type consistency:** `instancesOverlap`/`findConflicts`/`Conflict`/`ShiftWindow` (T1) consumed by the page (T2).
