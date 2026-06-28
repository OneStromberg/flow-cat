# Interactive Site Map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** `/admin/map` — a Google Map of all places as markers colored by **today's staffing status**, click → info (site, status, today's shifts). Roadmap §13 (places v1; employee last-check-in dots deferred).

**Tech Stack:** Next.js 15 App Router, Google Maps JS, Google Sheets.

## Global Constraints
- web extensionless imports. Maps key = `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (already set). Reuse the existing Maps loader pattern from `packages/web/app/admin/places/add/add-place-form.tsx` (`loadMaps`). Batch reads (no N+1). Admin-guarded. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: `/admin/map` page + map client + nav
**Files:** Create `packages/web/app/admin/map/page.tsx` + `map-client.tsx`; add a Map link (nav or shifts header).

- [ ] **Step 1: Page** `/admin/map/page.tsx` — server, `requireAdmin`→redirect. `const today = new Date().toISOString().slice(0,10)`. Load `listPlaces(gw)`, `listInstances(gw,{from:today,to:today})`, `listAssignments(gw,{})`. For each place with a numeric `lat`/`lng`, compute today's staffing:
  - its today instances (by `instance.location === place.name`), each with assigned count (from the one assignments read, status='assigned', non-cancelled instances);
  - `status`: no instances → `none`; every instance `assigned >= headcount` → `staffed`; any understaffed → `needs`.
  - Build markers: `{ name, lat:Number, lng:Number, status, shifts: [{start,end,assigned,headcount}] }`.
  Pass `markers` to `<MapClient markers={...} />`. `runtime='nodejs'`,`dynamic='force-dynamic'`. Import depth `../../../lib`.
- [ ] **Step 2: `map-client.tsx`** (`'use client'`) — reuse the `loadMaps(KEY)` loader (copy the small bootstrap from `places/add/add-place-form.tsx`, or import if exported; simplest: replicate the ~12-line loader). On mount: if no `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` → show "Maps key not configured"; else load Maps, `const { Map } = await google.maps.importLibrary('maps')`, create a map in a `ref` div (`h-[70vh] w-full`), fit bounds to the markers (or center Israel `{lat:31.5,lng:34.8}` zoom 7 if none). For each marker add a `google.maps.Marker` with a **colored circle icon** (`{ path: google.maps.SymbolPath.CIRCLE, scale:9, fillOpacity:1, strokeColor:'#fff', strokeWeight:2, fillColor: status==='staffed'?'#10b981': status==='needs'?'#ef4444':'#9ca3af' }`) and a click → `google.maps.InfoWindow` showing the site name, a status label (Staffed / Needs staff / No shifts today), and the today shifts list (`start–end · assigned/headcount`). Best-effort try/catch; clean up on unmount.
- [ ] **Step 3: Reachable** — add a **Map** entry: either a 7th admin-nav tab (icon 🗺) OR a "Map" link on the `/admin/shifts` header / `/admin/places` header. Implementer's call, but it MUST be reachable. (If the bottom nav is getting crowded at 7 tabs, prefer a link on the Places page header.)
- [ ] **Step 4: Verify** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build` (`/admin/map` present; builds with NO key — shows the not-configured message).
- [ ] **Step 5: Commit.** `git commit -m "feat(web): /admin/map interactive site map (markers colored by today's staffing)"`

---

## Self-Review Notes
- **Coverage:** map of places colored by today's staffing + click info (§13). Employee last-check-in dots deferred (would read attendance lat/lng).
- **Perf:** 3 batched reads (places, today instances, all assignments); per-place aggregation in memory.
- **Graceful:** no maps key → clear message; places without coords skipped.
