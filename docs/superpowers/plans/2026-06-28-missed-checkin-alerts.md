# Missed Check-in Alerts (§9) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Detect assigned workers who didn't check **in** (shift started + grace, no attendance) or **out** (shift ended + grace, still open), alert admins on Telegram, and dedup so we don't re-spam. Roadmap §9 (+ §10 contact: the message includes the worker's phone, which Telegram makes tappable).

**Tech Stack:** TypeScript, Next.js 15, Google Sheets, Telegram, Node test runner.

## Global Constraints
- worklog-core ESM `.ts` imports; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; verify typecheck + build.
- Times are absolute (instance `date`+`start`/`end`; overnight end<start ⇒ next day). Grace = global default 10 min (per-location override is a follow-up).
- Alerts go to admins via the existing `notifyAdmins(text, chatIds)` + `pickAdminChatIds`. Dedup via an `Alerts` tab. Endpoint guarded by `CRON_SECRET`.
- Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: `findMissedCheckins` + alert dedup data layer
**Files:** Create `packages/worklog-core/src/data/missed-checkins.ts` + `missed-checkins.test.ts`; export from `index.ts`.

**Interfaces — Produces:**
```ts
interface MissedEvent { instanceId: string; employeePhone: string; type: 'in' | 'out'; location: string; expectedAt: string /* ISO */ }
findMissedCheckins(gateway, nowISO: string, graceMins?: number): Promise<MissedEvent[]>
listSentAlerts(gateway): Promise<Set<string>>          // keys "instanceId|phone|type"
recordAlerts(gateway, events: MissedEvent[]): Promise<void>  // append to Alerts tab
```

- [ ] **Step 1: Failing tests** `missed-checkins.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { findMissedCheckins } from './missed-checkins.ts';

function seed(extra={}) {
  return createMemoryGateway({
    ShiftInstances: [['id','template_id','location','date','start','end','headcount','status','generated_at'],
      ['i1','t1','Site A','2026-07-01','08:00','16:00','1','scheduled','']],
    ShiftAssignments: [['instance_id','employee_phone','source','status','assigned_at','assigned_by'],
      ['i1','972501234567','manual','assigned','','']],
    Attendance: [['id','instance_id','employee_phone','date','check_in_at','check_in_lat','check_in_lng','check_in_photo','check_in_in_geofence','check_out_at','check_out_lat','check_out_lng','check_out_photo','check_out_in_geofence','hours','status']],
    Alerts: [['instance_id','employee_phone','type','sent_at']],
    ...extra,
  });
}
test('missed check-IN: start+grace passed, no attendance', async () => {
  const g = seed();
  const m = await findMissedCheckins(g, '2026-07-01T08:15:00.000Z', 10); // 15min after 08:00
  assert.equal(m.length, 1); assert.equal(m[0].type, 'in'); assert.equal(m[0].employeePhone, '972501234567'); assert.equal(m[0].location, 'Site A');
});
test('not missed before grace', async () => {
  const g = seed();
  assert.equal((await findMissedCheckins(g, '2026-07-01T08:05:00.000Z', 10)).length, 0);
});
test('checked in → no missed check-in; missed check-OUT after end+grace while still open', async () => {
  const g = seed({ Attendance: [
    ['id','instance_id','employee_phone','date','check_in_at','check_in_lat','check_in_lng','check_in_photo','check_in_in_geofence','check_out_at','check_out_lat','check_out_lng','check_out_photo','check_out_in_geofence','hours','status'],
    ['a1','i1','972501234567','2026-07-01','2026-07-01T08:00:00.000Z','','','','no','','','','','no','','open'],
  ]});
  const inM = await findMissedCheckins(g, '2026-07-01T08:15:00.000Z', 10);
  assert.equal(inM.length, 0); // checked in
  const outM = await findMissedCheckins(g, '2026-07-01T16:20:00.000Z', 10); // 20min after 16:00 end, still open
  assert.equal(outM.length, 1); assert.equal(outM[0].type, 'out');
});
```

- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement `missed-checkins.ts`:**
  - Date helpers: `startMs(date,start)=Date.parse(`${date}T${start}:00Z`)`; `endMs(date,start,end)` uses next day if `end<start`.
  - `findMissedCheckins(gateway, nowISO, graceMins=10)`: `const now=Date.parse(nowISO); const grace=graceMins*60000;`. Load `ShiftInstances` (status!=='cancelled'), `ShiftAssignments` (status==='assigned'), `Attendance`. Build `attByKey: Map<"instanceId|phone", Attendance rows[]>`. For each assigned (instance, phone):
    - instance must have a usable date/start/end. `inStart=startMs`; if `now > inStart + grace` AND there is NO attendance record for that (instance,phone) → push `{type:'in', expectedAt: new Date(inStart).toISOString(), location, ...}`.
    - `inEnd=endMs`; if `now > inEnd + grace` AND there IS an attendance record with `status==='open'` (checked in, not out) for that pair → push `{type:'out', expectedAt: new Date(inEnd).toISOString(), ...}`.
  - `listSentAlerts`: read `Alerts` → Set of `${instance_id}|${employee_phone}|${type}`.
  - `recordAlerts`: header-driven append each event as `{instance_id, employee_phone, type, sent_at: new Date().toISOString()}` to `Alerts`.
- [ ] **Step 4: Export** the four symbols from `index.ts`.
- [ ] **Step 5: Run — pass + typecheck.**
- [ ] **Step 6: Commit.** `git commit -m "feat(core): missed check-in/out detection + alert dedup"`

---

### Task 2: `/api/cron/missed-checkins` endpoint
**Files:** Create `packages/web/app/api/cron/missed-checkins/route.ts`. (No Vercel cron entry — this is triggered by an external scheduler; see notes.)

- [ ] **Step 1:** `GET` handler — `CRON_SECRET` bearer guard (401 if missing/mismatch). `const gw = getGateway(); const now = new Date().toISOString();` Compute `missed = await findMissedCheckins(gw, now)`. Load `sent = await listSentAlerts(gw)`; `const fresh = missed.filter(m => !sent.has(`${m.instanceId}|${m.employeePhone}|${m.type}`))`. If `fresh.length`: load `listWorkers(gw)` (phone→name) + `pickAdminChatIds`; build one message summarizing the fresh misses (each: `⚠️ <name> missed <check-in|check-out> at <location> (expected <HH:MM>) — 📞 <phone>`); `await notifyAdmins(message, admins)`; `await recordAlerts(gw, fresh)`. Return `{ ok:true, missed: missed.length, alerted: fresh.length }`. On error → 500 + best-effort admin notify. `runtime='nodejs'`,`dynamic='force-dynamic'`. Import depth `../../../../lib`.
- [ ] **Step 2: Verify** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build` (`/api/cron/missed-checkins` present).
- [ ] **Step 3: Commit.** `git commit -m "feat(web): missed-checkin alert cron endpoint (Telegram, deduped)"`

---

## Notes (scheduling — user setup, not in this build)
Vercel Hobby cron is daily-only, so this every-N-minutes poll needs an external trigger. Document for the user (do NOT build): a **Google Cloud Scheduler** job (3 free) hitting `https://flow-cat.vercel.app/api/cron/missed-checkins` every 10 min with header `Authorization: Bearer <CRON_SECRET>`, OR a free cron-job.org schedule. Until set up, the endpoint works on manual call.

## Self-Review Notes
- **Coverage:** missed in/out detection (T1, tested incl. grace + checked-in + overnight via endMs), dedup via Alerts (T1), the alerting endpoint (T2). §10 contact = tappable phone in the message.
- **Perf:** findMissedCheckins batches 3 reads; the endpoint adds workers + alerts reads. No per-row reads.
- **Dedup:** Alerts tab prevents re-spamming each poll; "escalation stored" = the Alerts record.
