# PM Batch 5 — Phase C1 (notifications) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Notification rules that don't need geoloc (spec: `docs/superpowers/specs/2026-07-06-pm-batch5-phaseC1-notifications-design.md`).

## Global Constraints
- worklog-core ESM `.ts`; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; `pnpm --filter @scourage/web typecheck && build`.
- Alerts are best-effort (try/catch; never fail the worker's check-in/out). Commit author = OneStromberg; LOCAL commits. ponytail.

---

### Task 1: time-based alert recency (repeat-every-5-min foundation)
**Files:** `packages/worklog-core/src/data/missed-checkins.ts` (+ test). Export from `src/index.ts`.
- [ ] **Step 1: Failing test** — `lastAlertAtByKey` returns the LATEST `sent_at` per `instanceId|phone|type`; `shouldRealert(lastIso, nowIso, minMs)` true when no prior or gap ≥ minMs:
```ts
test('lastAlertAtByKey returns latest sent_at; shouldRealert respects the window', async () => {
  const g = createMemoryGateway({ Alerts: [
    ['instance_id','employee_phone','type','sent_at'],
    ['i1','p1','in','2026-07-06T08:00:00.000Z'],
    ['i1','p1','in','2026-07-06T08:05:00.000Z'],
  ]});
  const m = await lastAlertAtByKey(g);
  assert.equal(m.get('i1|p1|in'), '2026-07-06T08:05:00.000Z');
  assert.equal(shouldRealert(m.get('i1|p1|in'), '2026-07-06T08:09:00.000Z', 5*60000), false); // 4m < 5m
  assert.equal(shouldRealert(m.get('i1|p1|in'), '2026-07-06T08:11:00.000Z', 5*60000), true);  // 6m ≥ 5m
  assert.equal(shouldRealert(undefined, '2026-07-06T08:11:00.000Z', 5*60000), true);          // never alerted
});
```
- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement:**
```ts
export async function lastAlertAtByKey(gateway: SheetsGateway): Promise<Map<string, string>> {
  const objs = rowsToObjects(await gateway.readTab('Alerts'));
  const m = new Map<string, string>();
  for (const o of objs) {
    const key = `${(o.instance_id??'').trim()}|${(o.employee_phone??'').trim()}|${(o.type??'').trim()}`;
    const sent = (o.sent_at ?? '').trim();
    if (!sent) continue;
    const prev = m.get(key);
    if (!prev || sent > prev) m.set(key, sent);
  }
  return m;
}
export function shouldRealert(lastSentIso: string | undefined, nowIso: string, minGapMs: number): boolean {
  if (!lastSentIso) return true;
  const last = Date.parse(lastSentIso), now = Date.parse(nowIso);
  if (!Number.isFinite(last) || !Number.isFinite(now)) return true;
  return now - last >= minGapMs;
}
```
- [ ] **Step 4: Export** both from `src/index.ts`.
- [ ] **Step 5: Run — pass + typecheck.**
- [ ] **Step 6: Commit.** `git commit -m "feat(core): time-based alert recency (repeat-until-checkin)"`

---

### Task 2: cron repeats missed check-in every 5 min (rule 1)
**Files:** `packages/web/app/api/cron/missed-checkins/route.ts`.
- [ ] **Step 1:** Read the route. It currently filters `fresh = missed.filter(m => !sent.has(key))` using `listSentAlerts` (permanent dedup) and `recordAlerts` after sending.
- [ ] **Step 2:** Replace the dedup with recency-based re-alerting: `const lastAt = await lastAlertAtByKey(gw); const now = new Date().toISOString(); const due = missed.filter(m => shouldRealert(lastAt.get(`${m.instanceId}|${m.employeePhone}|${m.type}`), now, 5*60000));`. Send for `due` (same message build), then `recordAlerts(gw, due)` (appends a fresh dated row each cycle). Import `lastAlertAtByKey, shouldRealert` (drop `listSentAlerts` if now unused). Keep the CRON_SECRET guard + best-effort error handling.
- [ ] **Step 3:** `pnpm --filter @scourage/web typecheck && build` → pass.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): missed check-in alert repeats every 5 min until check-in (rule 1)"`

---

### Task 3: check-in/out synchronous alerts (rules 2–5)
**Files:** `packages/web/app/api/checkin/route.ts`. Optionally extract pure predicates into a small tested helper in worklog-core if clean; otherwise inline (best-effort, wrapped).

- [ ] **Step 1:** Read `checkin/route.ts`. It already computes `place`, `instance`, `inGeofence`, `at`, has `hhmm(iso,tz)`, `COMPANY_TZ`, `localWallClockToUTC`, `notifyAdmins`, `pickAdminChatIds`, `listWorkers`, and an early-checkout block in `action==='out'`. The overnight rule: `endDate = instance.end < instance.start ? <date+1> : instance.date`.
- [ ] **Step 2 (rule 2 — refine early-checkout to >15min):** change the early-checkout condition from `Date.parse(at) < endMs` to `endMs - Date.parse(at) > 15*60000`.
- [ ] **Step 3 (rule 3 — early check-in >15min):** in `action==='in'`, AFTER a successful `checkIn`, best-effort: `const startMs = Date.parse(localWallClockToUTC(instance.date, instance.start, COMPANY_TZ)); if (startMs - Date.parse(at) > 15*60000) notifyAdmins(`⏱ ${worker.name} checked in early at ${instance.location} (${hhmm(at,COMPANY_TZ)}, starts ${instance.start}) — 📞 ${worker.phone}`, pickAdminChatIds(await listWorkers(gw)))`. Wrap in try/catch.
- [ ] **Step 4 (rule 4 — short shift <10min):** in `action==='out'`, after a successful `checkOut`, best-effort: read the checkout row's `check_in_at` (the route has `instanceId`+`worker.phone`; the simplest is to read it from the just-closed attendance — `checkOut` returns `{ok:true,hours}`; compute minutes from `hours*60`, or re-read the row). If `Date.parse(at) - Date.parse(checkInAt) < 10*60000` (and ≥ the 60s floor), alert `⚠️ ${worker.name} very short shift at ${instance.location} (${mins} min) — 📞 ${worker.phone}`. Reuse the same admin-chat load. (If `checkOut` already returns `hours`, `mins = Math.round(Number(hours)*60)`; alert when `mins < 10`.)
- [ ] **Step 5 (rule 5 — coverage gap, best-effort):** in `action==='out'`, after checkout: load today's instances at `instance.location` (`listInstances(gw, {from: today, to: today, location: instance.location})`), find one whose window is current/imminent (starts within the next 30 min or already started per TZ-correct start, and it's NOT this instance), whose assigned worker(s) (via `listAssignments`) are a DIFFERENT phone than `worker.phone` and who have NO OPEN attendance row for that next instance. If found, alert `🔁 Coverage gap at ${instance.location}: ${worker.name} left before the next shift's worker checked in — 📞 ${worker.phone}`. Entirely wrapped in try/catch; on any ambiguity emit nothing. If this proves too fiddly to do reliably, implement rules 2–4, mark rule 5 as deferred in the report, and DO NOT emit false alerts.
- [ ] **Step 6:** `pnpm --filter @scourage/web typecheck && build` → pass.
- [ ] **Step 7: Commit.** `git commit -m "feat(web): early check-in/out + short-shift + coverage-gap alerts (rules 2-5)"`

---

## Self-Review Notes
- **Coverage:** rule1→T1/T2 · rule2→T3 · rule3→T3 · rule4→T3 · rule5→T3(best-effort).
- **Type consistency:** `lastAlertAtByKey`/`shouldRealert` (T1) consumed by T2.
- **Ordering:** T1 first (T2 depends). T3 independent.
- **Note:** rule 1 (repeat) needs the every-5-min scheduler ON; rules 2–5 fire synchronously.
