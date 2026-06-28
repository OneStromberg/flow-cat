# F5 + F6 — Place by pin/coords & Copy-to-location — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:**
- **F5 (3.1):** add a place by dropping a map pin / entering raw lat,lng + a description — not only via Google address autocomplete (e.g. "a tractor in a field").
- **F6 (2.3):** replace copy-to-period with **copy-this-shift-to-another-location**.

**Tech Stack:** TypeScript, Next.js 15 App Router, Google Maps JS, Google Sheets, Node test runner.

## Global Constraints
- worklog-core ESM `.ts` imports; web extensionless. Verify typecheck + build.
- `addPlace` already validates name + numeric lat/lng (placeId/address optional) and stores `notes` — F5 is mostly a UI mode; no data-layer change for F5.
- `gateway.updateRow` 1-based. Admin-guarded. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: F6 — copyTemplate location override + route + UI
**Files:** `packages/worklog-core/src/data/shift-templates.ts` (extend `copyTemplate`); `shift-templates.test.ts`; `packages/web/app/api/admin/shifts/copy/route.ts`; `packages/web/app/admin/shifts/templates/[id]/template-detail.tsx`.

- [ ] **Step 1:** Extend `copyTemplate`'s opts to support a **location override** and optional validity (default = source's): change the signature to
```ts
copyTemplate(gateway, templateId, opts: { location?: string; validFrom?: string; validTo?: string; carryAssignments: boolean })
```
  Implementation: load source template; `addTemplate` with `location: opts.location ?? src.location`, `validFrom: opts.validFrom ?? src.validFrom`, `validTo: opts.validTo ?? src.validTo`, and the source's `label/days/start/end/headcount/rate/instructions`; carry active recurring if `carryAssignments`. (Keeps backward-compat: existing callers passing `{validFrom,validTo,carryAssignments}` still work.)
- [ ] **Step 2: Failing test** in `shift-templates.test.ts` — copy to a new location keeps days/times/instructions + source validity, new location:
```ts
test('copyTemplate to another location keeps schedule + instructions, new location', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions']], RecurringAssignments: [['template_id','employee_phone','active','created_at']] });
  const src = await addTemplate(g, { location:'Site A', label:'Guard 1', days:['Sun','Mon'], start:'09:00', end:'19:00', headcount:'1', validFrom:'2026-01-01', validTo:'2026-12-31', rate:'40', instructions:'patrol' });
  const cp = await copyTemplate(g, src.ok?src.id:'', { location:'Site B', carryAssignments:false });
  assert.equal(cp.ok, true);
  const t = (await listTemplates(g)).find((x)=>x.id===(cp.ok?cp.id:''))!;
  assert.equal(t.location, 'Site B'); assert.equal(t.instructions, 'patrol'); assert.equal(t.validFrom, '2026-01-01'); assert.deepEqual(t.days, ['Sun','Mon']);
});
```
  (Run to confirm fail, then implement Step 1, confirm pass.)
- [ ] **Step 3: Route** — `packages/web/app/api/admin/shifts/copy/route.ts`: change the body shape to `{ templateId, location, carryAssignments }`; call `copyTemplate(gw, templateId, { location: str(b.location), carryAssignments: !!b.carryAssignments })`; on ok `await generateInstances(gw, today)`; return `{ok,id}`.
- [ ] **Step 4: UI** — in `template-detail.tsx`, REPLACE the "Copy to period" section (the from/to date inputs) with **"Copy to another location"**: a location `<select>` (from the `places` prop, excluding the current location) + a "carry assignments" checkbox + Copy button → POST `{ templateId: template.id, location, carryAssignments }` to `/api/admin/shifts/copy`; on success `router.push('/admin/shifts/templates/' + returnedId)`.
- [ ] **Step 5: Verify** worklog-core tests + web typecheck + build.
- [ ] **Step 6: Commit.** `git commit -m "feat: copy shift to another location (replaces copy-to-period)"`

---

### Task 2: F5 — add place by pin / coordinates + description
**Files:** `packages/web/app/admin/places/add/add-place-form.tsx` (add a manual/pin mode).

- [ ] **Step 1:** In `add-place-form.tsx`, add a **mode toggle**: "Search address" (the existing Google `PlaceAutocompleteElement` flow) vs **"Drop a pin / enter coordinates"**. READ the current file first (it already loads Google Maps JS via a bootstrap loader and has `sel` state `{name,lat,lng,placeId,address}` + the `extra` fields incl. `notes`).
- [ ] **Step 2: Pin mode UI:**
  - A **name** text input (since there's no autocomplete to fill it).
  - An interactive **Google Map** (`google.maps.Map` via the already-loaded Maps JS): center on Israel (`{lat:31.5,lng:34.8}`, zoom 7) or the browser's geolocation if available; a click handler drops/moves a single `google.maps.Marker` and sets `lat`/`lng` state; the marker is draggable and updates state on `dragend`.
  - **lat** / **lng** number inputs, two-way synced with the marker (typing updates the marker; clicking/dragging updates the inputs).
  - A **description** `<textarea>` → stored in the existing `notes` field.
  - The other optional fields (client, contact, base_rate, geofence_radius_m, required_attributes) stay available.
  - **Save** is enabled when name + lat + lng are set; POSTs `{ name, lat, lng, placeId:'', address:'', ...extra (notes=description) }` to `/api/admin/places` (the existing route + `addPlace` validation already accept this). On success → `/admin/places`.
- [ ] **Step 3:** Keep the existing autocomplete mode fully working (the toggle just switches which input block renders). Reuse the existing Maps loader (`loadMaps`) — call `google.maps.importLibrary('maps')` + `'marker'` for the Map/Marker in pin mode.
- [ ] **Step 4: Verify** typecheck + build (`/admin/places/add` builds; works with NO maps key → show the existing "Maps key not configured" message; pin mode degrades to manual lat/lng inputs only when the map can't load).
- [ ] **Step 5: Commit.** `git commit -m "feat(web): add place by map pin / coordinates + description"`

---

## Self-Review Notes
- **Coverage:** F6 copyTemplate location override (T1, tested) + route + UI; F5 pin/coords/description add-place mode (T2). `addPlace` unchanged (already supports coords-only places via the existing validation + `notes`).
- **Backward-compat:** `copyTemplate`'s new optional `location` keeps existing `{validFrom,validTo,carryAssignments}` callers working (Part-B copy-to-period code path is replaced in the UI but the function stays compatible).
- **Graceful degradation:** F5 pin mode still offers manual lat/lng inputs when the map can't load (no/invalid Maps key).
