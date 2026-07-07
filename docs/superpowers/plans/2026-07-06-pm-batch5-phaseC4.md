# PM Batch 5 — Phase C4 (foreground geolocation + "not on site") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** While a worker is checked in and has the app open, poll their location (~every 30 min; every 5 min when out of zone) and alert admins if they're "not on site." Feature #6 + "not on site" notification. **Foreground-only** (browsers can't poll GPS in the background — accepted; polling runs only while the app is open).

## Global Constraints
- worklog-core ESM `.ts`; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; `pnpm --filter @scourage/web typecheck && build`.
- Alerts best-effort. Reuse `distanceMeters`/`withinGeofence` + per-place `geofenceRadiusM` (default 100) and the `lastAlertAtByKey`/`shouldRealert`/`recordAlerts` dedup. Commit author = OneStromberg; LOCAL commits. ponytail.

---

### Task 1: `/api/geo/ping` — geofence check + deduped "not on site" alert
**Files:** widen `MissedEvent.type` in `packages/worklog-core/src/data/missed-checkins.ts` to `'in' | 'out' | 'offsite'` (1-line; `recordAlerts` already writes any type); create `packages/web/app/api/geo/ping/route.ts`.

- [ ] **Step 1:** In `missed-checkins.ts`, change `type: 'in' | 'out'` → `type: 'in' | 'out' | 'offsite'` in the `MissedEvent` interface. Run `pnpm --filter @scourage/worklog-core test` (should still pass — widening only). Commit-worthy but bundle with step 4.
- [ ] **Step 2: Route** `packages/web/app/api/geo/ping/route.ts` — `POST`, `requireWorker` (401 if not / inactive). `runtime='nodejs'`. Body `{ instanceId, lat, lng }` (lat/lng numbers). 
  - Load `getGateway()`. Verify the worker has an OPEN attendance for this instance: `listAttendance(gw, { instanceId, employeePhone: worker.phone })` and find one with `status==='open'`. If none → return `{ ok:true, inZone:true, nextPollMs: 1800000 }` (nothing to monitor; slow cadence).
  - Find the instance (`listInstances(gw, {from: today, to: today})` → by id) and its place (`listPlaces` → by `instance.location`). Compute `inZone`: if place has coords, `withinGeofence(distanceMeters(lat, lng, Number(place.lat), Number(place.lng)), Number(place.geofenceRadiusM) || 100)`; if no coords, treat as `inZone:true` (can't enforce).
  - If NOT inZone: best-effort deduped alert — `const key = \`${instanceId}|${worker.phone}|offsite\`; const lastAt = await lastAlertAtByKey(gw); if (shouldRealert(lastAt.get(key), new Date().toISOString(), 15*60000)) { notifyAdmins(\`📍 ${worker.name} is NOT on site at ${instance.location} — 📞 ${worker.phone}\`, pickAdminChatIds(await listWorkers(gw))); await recordAlerts(gw, [{ instanceId, employeePhone: worker.phone, type:'offsite', location: instance.location, expectedAt: new Date().toISOString() }]); }` (wrap in try/catch — never fail the ping).
  - Return `{ ok:true, inZone, nextPollMs: inZone ? 1800000 : 300000 }` (30 min in-zone, 5 min out).
  - Imports: `listAttendance, listInstances, listPlaces, listWorkers, distanceMeters, withinGeofence, lastAlertAtByKey, shouldRealert, recordAlerts, todayISO` from core; `notifyAdmins, pickAdminChatIds` from lib; `COMPANY_TZ, getGateway` from lib.
- [ ] **Step 3:** `pnpm --filter @scourage/web typecheck && build` → pass.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): geo ping endpoint + deduped not-on-site alert (feat 6)"`

---

### Task 2: foreground location poller (client)
**Files:** create `packages/web/app/app/checkin/geo-poller.tsx`; mount it in `checkin-client.tsx`.

- [ ] **Step 1:** Read `checkin-client.tsx` — it renders each instance with `isOpen = attendance?.status === 'open'` and already uses `navigator.geolocation.getCurrentPosition`. Determine the id(s) of any OPEN instance for the worker.
- [ ] **Step 2:** Create `geo-poller.tsx` (`'use client'`) — `<GeoPoller instanceId={string} />`:
  - On mount (and only while mounted), run a poll loop: `getCurrentPosition` → POST `{ instanceId, lat, lng }` to `/api/geo/ping` → read `nextPollMs` from the response → schedule the next poll with `setTimeout(poll, nextPollMs)` (default 1800000 if missing). Use a `useEffect` with a cancel flag + `clearTimeout` cleanup so it stops on unmount. Do the FIRST poll shortly after mount (e.g. 5s), then follow the server cadence.
  - If geolocation is denied/unavailable, stop silently (no spam). Optionally render a tiny muted "📍 location monitoring on" line; keep it unobtrusive. Foreground-only is inherent (timers pause when the tab is suspended) — no extra work, but add a one-line `// ponytail: foreground-only; browsers can't poll GPS in the background.` comment.
- [ ] **Step 3:** In `checkin-client.tsx`, render `<GeoPoller instanceId={openInstanceId} />` when there is an open instance (pick the first open one). Don't mount it when nothing is open.
- [ ] **Step 4:** `pnpm --filter @scourage/web typecheck && build` → pass.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): foreground geolocation poller during active shift (feat 6)"`

---

## Self-Review Notes
- **Coverage:** feat6 + "not on site" → T1 (ping + alert) + T2 (poller). Foreground-only per decision.
- **Dedup:** offsite alerts reuse `lastAlertAtByKey`/`shouldRealert` (15-min window) + `recordAlerts` (type `'offsite'`).
- **Cadence:** server returns `nextPollMs` (30 min in-zone / 5 min out) so the client adapts — matches the "2×/hour, 5-min when off-site" requirement.
- **Ordering:** T1 → T2 (poller calls the endpoint).
- **Limitation:** foreground-only; a suspended tab / locked phone stops reporting (documented; native app needed for true background).
