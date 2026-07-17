# PM Feedback Batch 6 — Design

**Date:** 2026-07-17
**Context:** First batch **post-Firestore** (storage now lives behind `SheetsGateway` → `createFirestoreGateway`; the row/tab model — header row + append/update-by-index — is unchanged, so `worklog-core` data modules keep working verbatim). This is **batch 6**: ~20 items across Workers, Shifts, Places, Attendance, Broadcast, Bot, the Worker interface, and a large Reports rework. Builds on batch-4 (geofence hard-block on check-in, template soft-delete, editable places) and batch-5 (multi-slot templates, `formatTemplateOffer`, Telegram Accept/Call buttons, `seedTemplateInstances`).

Spec only — no plan, no code. Each item gives the approach, the exact files, the design decision(s) I'm making, and open questions for the PM. YAGNI/ponytail flagged where the PM's ask risks over-building.

---

## Area 1 — Workers

The worker forms are three separate components that all render the same field set through local `input()` / `select()` helpers with **hardcoded English labels** (no i18n exists — see U1):
- Admin add: `packages/web/app/admin/add/add-worker-form.tsx`
- Admin edit (worker card): `packages/web/app/admin/workers/[phone]/worker-card.tsx`
- Self-registration: `packages/web/app/register/register-form.tsx`

The shared data layer for all three is `packages/worklog-core/src/data/add-worker.ts` (`addWorker` + `updateWorker`, `WORKERS_COLUMNS` at ~L22, `AddWorkerInput`/`UpdateWorkerInput`), the field enums live in `packages/worklog-core/src/data/worker-fields.ts`, and the read model is `packages/worklog-core/src/data/workers.ts` (`Worker` interface).

### W1 — Rename "Name" → "Full name"
**Approach:** Label-only change. In all three forms replace `{input('name', 'Name')}` with `{input('name', 'Full name')}`. Field key stays `name`; no data-layer change.
**Files:** `add-worker-form.tsx:77`, `worker-card.tsx:114`, `register-form.tsx:109`.
**Decision:** English string here is a placeholder-until-i18n; once U1 lands, "Full name" becomes a dictionary key on the worker-facing (register) form. Admin forms stay EN (admin is not in scope for U1).
**Open Q:** Confirm the RU label — "Полное имя" — for the register form.

### W2 — Derive age from date of birth
**Approach:** Collect a **birthdate** (`<input type="date">`) at account creation and store it as the source of truth; compute age on read. Recommendation confirmed in the requirement: **store birthdate, not age.**
- Add a `birthdate` column to `WORKERS_COLUMNS` (`add-worker.ts:22`). The header-merge logic already appends unknown columns non-destructively (`addWorker` L82-89 / `updateWorker` L170-174), so no migration is forced — old rows simply have an empty `birthdate`.
- Add `birthdate` to `AddWorkerInput`/`UpdateWorkerInput` and write it in both record builders (`add-worker.ts` ~L61 / ~L176). Validate format (ISO `YYYY-MM-DD`, not in the future, plausible range).
- Add `birthdate?: string` to the `Worker` read model (`workers.ts`) and a pure `ageFromBirthdate(birthdate, now?): number | null` helper in `worklog-core` (exported from `index.ts`). Age is displayed wherever age is shown, computed from birthdate.
- Forms: replace `{input('age', 'Age', 'number')}` with a date input for birthdate (register-form.tsx:113, add-worker-form.tsx:88, worker-card.tsx:128).
**Decision — keep the `age` column?** Keep it as a **legacy/back-compat read-only** column: do NOT write it from the UI anymore, but if `birthdate` is empty fall back to the stored `age` string on read (mirrors batch-4's "force hourly but leave pay_structure column" pattern). This makes existing workers correct without a back-fill.
**PM answer (resolved):** the PM **has the DOBs** and will enter them via profiles, so the `birthdate` field must be **editable on the worker EDIT form / worker card** (not just at account creation). No bulk back-fill needed — the PM fills them in through the edit path; legacy rows fall back to the stored `age` until edited.
**Open Q:** none — birthdate is editable on both create AND edit (worker-card) paths; PM enters DOBs manually.

### W3 — Wire the embedded `CITIES` list into the admin forms
**Root confirmed:** the rich bilingual `CITIES` constant (`worker-fields.ts:35`, `value` = Hebrew canonical, `label` = "Русский — עברית") is wired **only** into self-registration (`register/page.tsx:14` → `register-form.tsx:112`). The admin add form uses a plain string list from `loadCities(gw)` (`admin/add/page.tsx:15`), and the worker card uses `selectWithFallback('city', 'City', cities)` (`worker-card.tsx:106,127`) — a free-text-passthrough of whatever string is already stored. So the admin genuinely cannot pick from the curated city list, and (post-Firestore) can't hand-edit the sheet either.
**Approach:** Feed `CITIES` into both admin forms as the option source, keeping the free-text fallback so an existing non-listed city value isn't lost.
- Import `CITIES` where `loadCities` is currently used (`admin/add/page.tsx`, `admin/workers/[phone]/page.tsx`), OR pass `CITIES` straight into the form and drop the dynamic `loadCities` call.
- Admin add: swap the `cities.map(...)` select (`add-worker-form.tsx:87`) to render `CITIES` options.
- Worker card: keep `selectWithFallback`'s "prepend current value if not in list" behavior (`worker-card.tsx:106-110`) but source its `opts` from `CITIES` values so the label shows the bilingual text.
**Decision:** `CITIES` becomes the single source for the city picker across all three forms; `loadCities()` (dynamic scrape of `Cities`/`Workers` tabs, `cities.ts`) is retired from the admin path (or demoted to a fallback merge). Ponytail check: do NOT build a city-management CRUD screen — the constant list is sufficient.
**Open Q:** Is the 27-city `CITIES` constant the definitive list, or do you want a couple added (e.g. the Gedera-area towns that show up in place names)?

### W4 — Relabel the "Schedule" field → "Shift preference"
**Approach:** Labels/option-text only. Field key stays `schedule`; enum **values** stay `days`/`nights`/`all` (data unchanged).
- `worker-fields.ts:21-25` `SCHEDULE`: change option labels to EN "Days / Nights / Any" (currently "Days / Nights / All").
- All three forms: change the field label from `'Schedule'` to "Shift preference" (`add-worker-form.tsx:95`, `worker-card.tsx:135`, `register-form.tsx:117`).
- RU (register form, via U1): label "Предпочтение по сменам", options "Днём / Ночью / В любое время".
**Decision:** No data migration — the stored value `all` simply now renders as "Any"/"В любое время". This ties into U1: the schedule labels become dictionary entries on the worker-facing form.
**Open Q:** none (cosmetic).

---

## Area 2 — Shifts

Data layer: `packages/worklog-core/src/data/{shift-templates,shift-instances,shift-assignments,places,payroll}.ts`. UI: `packages/web/app/admin/shifts/**`. Instance columns: `['id','template_id','location','date','start','end','headcount','status','generated_at']`; status ∈ `scheduled` | `cancelled`. Assignment columns: `['instance_id','employee_phone','source','status','assigned_at','assigned_by']` — status ∈ `assigned` | `removed`.

### S1 — Cascade delete (place → templates → future instances) — the Gedera bug
**Root confirmed:**
- `deleteTemplate` (`shift-templates.ts:226-236`) only soft-deletes the template (`active='no'`). `generateInstances` filters `t.active` (`shift-instances.ts:227`) so it stops *generating* new ones, but already-generated future `scheduled` instances are left untouched — the batch-4 "existing future instances are left as-is" limitation, now biting.
- `deletePlace` (`places.ts:118-136`) only soft-deletes the place row (`active='no'`). Nothing cascades to its templates or instances; instances reference the place by `location` **string**, so there is no FK to walk — orphans are invisible to any existence check.
- A `cancelInstance(gateway, id)` primitive already exists (`shift-instances.ts:208-217`, soft-sets `status='cancelled'`), and `applyTemplateEdit` already cancels future instances when a template day/validity is removed (`shift-instances.ts:162-166`) — so the cancel machinery is present; we just need to invoke it on delete.

**Approach — define the cascade explicitly:**
- **Delete template →** after setting `active='no'`, cancel its **future, still-`scheduled`** instances: for every instance with `template_id === id`, `date >= today`, `status === 'scheduled'`, set `status='cancelled'`. New helper `cancelFutureInstancesForTemplate(gateway, templateId, today)` in `shift-instances.ts` (loops + reuses the `cancelInstance` write, or one batched pass). `deleteTemplate` calls it (or the route orchestrates template-then-instances).
- **Delete place →** cascade in two hops: soft-delete the place, soft-delete every template whose `location === place_name` (reuse `deleteTemplate` semantics), and cancel each of those templates' future scheduled instances. New helper `cascadeDeletePlace` or route-level orchestration calling `deletePlace` + `listTemplates().filter(location===name)` + per-template cancel.
- **Started/in-progress or past instances are NOT cancelled** (a shift someone worked stays as history); only `date >= today` && `status==='scheduled'` && (unstarted) get cancelled. This matches the presence/color model where past attendance must survive for payroll.

**Already-orphaned data (the live Gedera shifts):** the 4 phantom Gedera shifts already exist with a now-inactive place/template. Two options — decide with PM:
  1. **One-shot repair:** a small admin action / script that finds `scheduled` future instances whose `template_id` points to an inactive (or missing) template OR whose `location` points to an inactive place, and cancels them. Cleans Gedera now and any historical orphans.
  2. **Rely on S2's view filter** to simply hide them (cheaper, but they linger in data).
**Recommendation:** do both — S2 hides them immediately; the S1 repair pass cancels them so they're gone from every consumer (map, reports, color counts).
**Files:** `shift-templates.ts` (`deleteTemplate`), `places.ts` (`deletePlace`), `shift-instances.ts` (`cancelInstance`, new cascade helper), the delete routes under `packages/web/app/api/admin/shifts/templates/[id]/route.ts` and `packages/web/app/api/admin/places/**`.
**Decision:** cascade = soft (status flips), never row-removal — consistent with the append-only model. The place→template→instance walk is by string `location` + `template_id`, done server-side in one route so it's atomic-ish (Firestore has no cross-doc transaction here, but the order place→templates→instances is safe: worst case a retry re-cancels idempotently).
**Open Q (roundup):** confirm the exact semantics for the *already-orphaned* Gedera instances — one-shot cancel (recommended) vs. hide-only.

### S2 — Hide cancelled instances from the calendar
**Root confirmed:** cancelled instances currently render everywhere with `opacity-50 line-through` gray chips — `week-columns.tsx:64,83`, `month-grid.tsx:62-79`, `day-list.tsx:57-97`. The shift page (`admin/shifts/page.tsx`) loads all instances in range and does **not** filter cancelled before rendering. (Note the map page *already* filters `inst.status !== 'cancelled'` — `map/page.tsx:47` — good precedent.)
**Approach:** Filter `status === 'cancelled'` out of the instance list the shift views consume — cleanest at the page level (`admin/shifts/page.tsx`, where instances are loaded and the count maps are built), so week/month/day and the color/`presentNow` counts all see only live instances. Drop the now-dead `cancelled` styling branches in the three renderers.
**Decision:** Hard hide (not a toggle). Ponytail: do NOT add a "show cancelled" filter UI — nobody asked and it re-introduces the clutter. If an admin needs to see a cancelled shift, it's still reachable by direct URL (`instances/[id]`), which keeps the "CANCELLED" badge.
**Open Q:** Should the **instance detail page** still be openable for a cancelled instance (I say yes — for audit), or 404? Assuming yes.

### S3 — Duplicate assignments (e.g. ילנה רוגק)
**Root investigated:** `assignManual` (`shift-assignments.ts:118-148`) **already guards** against a duplicate active row — it appends only if no `(instance_id, employee_phone, status='assigned')` row exists. Recurring seeding in `generateInstances`/`seedTemplateInstances` also dedups on `instanceId|phone` (any status). So a fresh double-assign shouldn't happen through the current code paths. The duplicates the PM saw are most likely **legacy rows written before the guard existed**, or a race between recurring-seed and manual-assign, or rows differing only by `status` (an `assigned` + a stale `removed` + a re-`assigned`).
**Approach (defense in depth):**
1. **Harden the guard:** make the dedup key on assign match on `(instance_id, employee_phone)` ignoring status when deciding "already effectively assigned," and treat re-assign as reactivating the existing row rather than appending. Confirm `seedTemplateInstances` and `assignManual` can't both append in the same window.
2. **One-shot de-dup of existing data:** a repair pass that collapses multiple `assigned` rows for the same `(instance_id, employee_phone)` down to one (keep earliest `assigned_at`, mark the rest `removed`). Run once; idempotent.
3. **Surface on the conflicts page:** `packages/worklog-core/src/data/conflicts.ts` + `packages/web/app/admin/conflicts/**` — add a "duplicate assignment" conflict type (same worker, same instance, >1 active row) so any future recurrence is visible rather than silent.
**Files:** `shift-assignments.ts` (`assignManual`, dedup), `shift-instances.ts` (seed paths), `conflicts.ts`, `admin/conflicts/`.
**Decision:** the guard fix is the real fix; the data de-dup + conflicts surfacing are cleanup + safety net. Not building a UI to manually merge duplicates — the repair pass + conflict flag is enough.
**Open Q:** Was ילנה assigned **manually twice**, or **manual + recurring**? (Determines whether the race is manual-vs-manual or seed-vs-manual — the PM may know from the timeline; either way the status-agnostic guard covers it.)

### S4 — Per-assignment hourly rate
**Root confirmed:** rate resolves employee→template→location via `resolveHourlyRate(employeeRate, templateRate, locationRate)` (`payroll.ts:18-20`, `pos(a)||pos(b)||pos(c)||0`). `ShiftAssignments` has **no** rate column today. Payroll consumers: `admin/payroll/page.tsx` and the reports route (`api/admin/reports/route.ts`) both build `WorkedItem[]` and call `resolveHourlyRate(w.payRate, tmpl?.rate, place?.baseRate)`.
**Approach:**
- Add a `rate` column to `ASSIGN_COLUMNS` (`shift-assignments.ts:17` / the mirror in `shift-instances.ts:17`). Optional per row; empty = "no override."
- Extend `assignManual` (and the assign route + the assign UI) to accept an optional `rate`. Add `rate` to the `ShiftAssignment` read model.
- **Rate resolution becomes: per-assignment → employee → template → location.** Add a param to `resolveHourlyRate` (or a small wrapper `resolveAssignmentRate(assignmentRate, employeeRate, templateRate, locationRate)`) and thread the per-instance-per-worker assignment rate into the `WorkedItem` build in **both** payroll consumers.
- Assign UI: `instances/[id]/instance-detail.tsx` — add an optional rate field next to each assign (and show the effective rate on existing assignment chips).
**Files:** `shift-assignments.ts` (schema, `assignManual`), `payroll.ts` (`resolveHourlyRate`/wrapper), `admin/payroll/page.tsx`, `api/admin/reports/route.ts`, `instances/[id]/instance-detail.tsx`, the assign route `api/admin/shift-instances/[id]/route.ts`.
**Decision:** per-assignment rate is a **new top-priority tier**, empty-means-fallback (never `0` means "free"). Recurring-seeded assignments get no rate (fall through to employee/template/location) unless the admin sets one on the instance.
**Open Q (roundup):** For **existing** assignments the `rate` column is empty → they keep resolving employee→template→location (no behavior change). Confirm that's the desired default (vs. requiring a back-fill).

### S5 — Week view doesn't use full width on laptop/tablet
**Root confirmed:** `week-columns.tsx:34` wraps the 7 day-columns in `overflow-x-auto`, each column is `min-w-[9rem] flex-shrink-0` (L38) → 7 × 9rem ≈ 63rem, and the shift page constrains the whole thing in `max-w-2xl` (`admin/shifts/page.tsx:151`) ≈ 42rem. So on a wide screen the container is capped at ~42rem, showing ~4.5 fixed-width columns and horizontally scrolling the rest, while the bottom nav spans full width — the visual mismatch the PM flagged.
**Approach:** Let the week view use the available width. Two levers: (1) widen the shift page container on `md+` (e.g. `max-w-2xl` → a responsive `md:max-w-5xl`/`lg:max-w-6xl`, or full-width with padding) so a full week fits; (2) make the 7 columns flex to fill (`flex-1 min-w-0` with a sensible `min-w` floor) instead of fixed `9rem`, keeping horizontal scroll only as the narrow-screen fallback. Mobile (the primary target) is unchanged — it keeps the scroll.
**Files:** `packages/web/app/admin/shifts/page.tsx` (container width), `packages/web/app/admin/shifts/week-columns.tsx` (column sizing/grid). Check the shifts layout wrapper if a shared width cap lives higher up.
**Decision:** responsive width — narrow stays scrollable, `md+` shows the full week. Do NOT rebuild the week view as a CSS-grid from scratch (YAGNI); adjust the two width constraints. Month/day views are already fine.
**Open Q:** none major — confirm you want the *admin shifts* pages generally wider on desktop, or only the week view.

---

## Area 3 — Places

### P1 — Map info-windows: list assigned workers + reorganize
**Root confirmed:** `map/page.tsx` loads `places`, today's `instances`, and all `assignments` (with `employeePhone`), but only aggregates an assigned **count** per instance (`map/page.tsx:34-37`) and passes `MapMarker { name, lat, lng, status, shifts[{start,end,assigned,headcount}] }` (L12-18,66) to the client. `map-client.tsx:46-57` `buildInfoHtml` renders name + status + per-shift times/counts. The close ✕ is Google Maps' native InfoWindow control (no custom markup).
**Approach:**
- In `map/page.tsx`, build a `phone → name` map from `listWorkers` and attach `workers: string[]` (names) to each shift on the marker (join assignments → instance → worker name). Extend the `MapMarker`/shift shape to carry the names.
- In `map-client.tsx buildInfoHtml`, render the worker names under each shift line, and restructure the window (tighter header, grouped shift rows, names as a small list/chips).
- The oversized native close ✕: since it's the Google Maps default, "reorganize" = give the InfoWindow custom content with our own padding/close affordance, or set InfoWindow options to reduce chrome. Simplest: keep the native close but redesign the content block (header/spacing) so the ✕ isn't visually dominant; if the PM insists, use a custom overlay.
**Files:** `packages/web/app/admin/map/page.tsx` (data join + marker shape), `packages/web/app/admin/map/map-client.tsx` (`buildInfoHtml`, InfoWindow options).
**Decision:** show worker **names** (not phones) in the info-window; reuse the existing "cancelled excluded" filter already in `map/page.tsx:47`. Ponytail: don't add per-worker links/actions inside the map bubble — names are enough for the PM's ask.
**Open Q:** For a place with multiple shifts today, list names **per shift** (grouped) or a single deduped roster for the place? (I lean per-shift, matching the existing shift rows.)

---

## Area 4 — Attendance

### A1 — Forbid out-of-zone check-OUT; clarify the ⚠ marker
**Root confirmed:**
- Check-**in** is hard-blocked outside the geofence: `api/checkin/route.ts:92-94` returns HTTP 422 `outside_geofence` when `action==='in' && place has coords && inGeofence===false`. Check-**out** (`route.ts:125-137`) records `check_out_in_geofence` but does **not** block.
- The ⚠ triangle in the admin table (`admin/attendance/attendance-client.tsx:116-119`) is **two independent markers** — one for `checkInInGeofence`, one for `checkOutInGeofence` — so ⚠ means "this check-in **or** check-out was outside the zone." Confirmed: it flags out-of-zone on either leg.
- Geofence math: `inGeofence = withinGeofence(distanceMeters(...), place.geofenceRadiusM || 100)` (`route.ts:81-89`); the per-place radius is the existing lever.
**Approach:** Mirror the check-in block for checkout. In `api/checkin/route.ts`, extend the guard so `action==='out'` with `place` coords and `inGeofence===false` is **rejected** (same 422 shape, message like "You're outside <place>'s zone — move closer to end your shift, or ask your manager to widen the radius."). If the place has no coords, unchanged (can't enforce). The client (`app/app/checkin/checkin-client.tsx`) already surfaces the 422 error — reuse that path; drop/replace the current "recorded anyway" soft warning for checkout.
- Clarify the ⚠ marker: keep the two-marker design but improve the `title`/legend so admins read it as "out of allowed zone (in / out)." Optionally split the tooltip text per leg.
**Files:** `packages/web/app/api/checkin/route.ts` (the `action==='out'` branch, ~L125), `packages/web/app/app/checkin/checkin-client.tsx` (error surfacing), `packages/web/app/admin/attendance/attendance-client.tsx` (marker tooltip/legend).
**Decision:** checkout gets the **same** hard-block as check-in, gated by the **same per-place radius**. This does introduce the "stuck worker can't check out from just outside the zone" risk — mitigated by the per-place radius lever (admin widens it). 
**Open Q:** If a worker legitimately can't check out (bad GPS / just outside), what's the escape hatch — admin-side manual checkout only (exists via adjustments/attendance edit?), or a soft-override? The check-in block has the same issue today, so matching it is defensible, but confirm you accept the symmetry.

---

## Area 5 — Broadcast

### B1 — Make a broadcast template read as a recurring shift
**Root confirmed:** `formatTemplateOffer` (`shift-templates.ts:188-224`) already prints a per-day schedule (grouped by weekday, multi-slot aware) under a "Schedule:" heading and includes `validFrom` ("From:"), but it does **not** signal that this is an **ongoing/recurring** offer, and omits `validTo`. Sent as plain text (no `parse_mode`).
**Approach:** Improve the message copy in `formatTemplateOffer` so it clearly reads as a recurring shift:
- Title/subtitle that says this is an ongoing/recurring shift (e.g. under the "🆕 Доступна новая смена" title add a line like "Постоянная смена (еженедельно)" / recurring weekly).
- Label the schedule block as the **weekly** working days (e.g. "Рабочие дни (еженедельно):").
- Include the validity window: "From <validFrom>" and, when set, "until <validTo>"; if open-ended, say "постоянно/ongoing."
- Keep the per-day time lines (already multi-slot correct).
**Files:** `packages/worklog-core/src/data/shift-templates.ts:188-224` (`formatTemplateOffer`), consumed by the broadcast-template path (`api/admin/broadcast/template/route.ts`, `admin/broadcast/**`).
**Decision:** copy-only change to the pure builder (unit-testable, no send-path change). RU-first strings (the offer already opens in Russian). Ties into Bot1's readability work.
**Open Q:** Exact RU wording for "recurring/weekly/ongoing" — I'll propose, you approve.

---

## Area 6 — Bot (Telegram)

Message plumbing: `packages/web/lib/telegram.ts` (`sendTelegram(chatId, text)`, `sendToChatIds`, `notifyAdmins`, `buildSendUrl`). **No `parse_mode`** is set anywhere — every message is plain text. Admin alert bodies are built in `api/checkin/route.ts` (early-in/early-out/short-shift/coverage-gap, all `... — 📞 ${worker.phone}`) and `api/telegram/webhook/route.ts` (accept-offer).

### Bot1 — Readability (Hebrew + English / RTL-LTR mixing)
**Approach:** Structure the messages for legibility rather than one run-on RTL/LTR-mixed line:
- Put each field on its own line with a leading label/emoji (Location / Worker / Time / Phone), so a Hebrew place name and Latin time don't collide mid-line.
- Keep numbers, times, and phone in their own lines (LTR content) separated from RTL Hebrew names — line breaks are the cheapest RTL/LTR fix and need no `parse_mode`.
- Apply consistently to `formatTemplateOffer` (B1) and the `api/checkin/route.ts` alert builders and the webhook accept message.
**Files:** `packages/web/lib/telegram.ts`, `packages/web/app/api/checkin/route.ts` (alert strings), `packages/web/app/api/telegram/webhook/route.ts`, `shift-templates.ts` (`formatTemplateOffer`).
**Decision:** achieve readability via **line structure + labels**, not by adopting an i18n/RTL framework or bidi control chars (ponytail — bidi isolates are fragile across Telegram clients; line breaks are robust). Consider extracting the alert strings into small builder functions in `worklog-core` so they're unit-tested (mirrors `formatTemplateOffer`).
**Open Q:** Do you want the alerts in **Russian** (matching the worker offers) or bilingual RU/HE? Admins may prefer HE.

### Bot2 — Make the guard's phone number tappable
**Root confirmed:** phones are emitted as plain text `📞 ${worker.phone}` (`api/checkin/route.ts:121,152,160,181`; webhook accept), and `sendTelegram` posts `{ chat_id, text }` with **no `parse_mode`** (`telegram.ts:7,18`).
**Approach — decision on what actually renders tappable in Telegram:**
- **Simplest reliable option:** ensure the phone is in **E.164** (`+9725XXXXXXXX`, no spaces/dashes) — Telegram **auto-links** E.164 numbers in plain text into a tap-to-call/copy link. `worker.phone` is already normalized (`normalizePhone`), so just guarantee the printed form is E.164. This needs **no** `parse_mode` change. Preferred.
- **If we want an explicit link:** switch the relevant sends to `parse_mode: 'HTML'` and emit `<a href="tel:+9725...">📞 +9725...</a>` or a `https://wa.me/9725...` link. This requires threading a `parse_mode` param through `sendTelegram`/`sendToChatIds`/`notifyAdmins` and HTML-escaping the dynamic name/place fields (security note: escape to avoid breaking on `<`/`&` in place names).
**Recommendation:** go with **E.164 auto-link** (option 1) — zero plumbing, no escaping risk. Reserve the HTML/`tel:`/`wa.me` route only if the PM specifically wants a WhatsApp deep-link.
**Files:** `packages/web/lib/telegram.ts` (only if HTML route chosen), `packages/web/app/api/checkin/route.ts` (phone formatting), `api/telegram/webhook/route.ts`.
**Open Q:** Tap-to-**call** (E.164 auto-link / `tel:`) or tap-to-**WhatsApp** (`wa.me`)? The PM said "call the guard," which points to `tel:`/E.164, but wa.me is common in IL.

---

## Area 7 — Worker interface

Worker-facing pages: `packages/web/app/app/**` — `checkin` (home/start-shift, `checkin-client.tsx`), `hours`, `profile`, `edit/[id]`, plus `worker-nav.tsx`, `layout.tsx`. All strings are **hardcoded English inline** — there is **no i18n mechanism, no library, no lang toggle** (confirmed: no i18n dep in `packages/web/package.json`; the only `locale*` usages are `localeCompare`/`toLocaleTimeString`).

### U1 — Language TOGGLE (RU / EN / HE) on the WORKER interface (i18n)
**PM answer (resolved):** the workforce mixes Russian, Hebrew AND English speakers, so this is a **language toggle**, not a fixed RU default. The dictionary carries **three locales — `ru` / `en` / `he`**; language is a **per-worker `lang` preference** (stable across devices) PLUS a **visible toggle** on the worker interface that updates that preference. Default when unset: `ru`.

**Approach (lightest — ponytail on frameworks):**
- A **plain dictionary** module (`packages/web/lib/i18n/strings.ts`): `{ ru: {...}, en: {...}, he: {...} }` keyed by short string ids, plus a tiny `t(key, lang)` helper. No `next-intl`/`i18next`/`react-intl` (overkill for a handful of worker screens). Fill `ru` + `en` now with real strings; the `he` keys are present in the structure and completed **progressively** (Hebrew keys can land incrementally — `t()` falls back `he → en → key` for any not-yet-filled `he` string).
- **Language selection:** a **per-worker `lang` column** (new optional `lang` on Workers, default `ru`) so it is stable across devices, PLUS a **visible toggle** on the worker interface (on the profile page, and/or a small switcher in the worker nav) that writes the preference. Worker-facing pages read the worker's `lang` and render through `t(key, lang)`.
- **Scope:** worker-facing pages only (`app/app/**`) — checkin, hours, profile, edit, nav. Admin surfaces stay English.
**Files:** new `lib/i18n/strings.ts` + `t()` (three-locale dict); `app/app/checkin/checkin-client.tsx`, `app/app/hours/page.tsx`, `app/app/profile/page.tsx`, `app/app/edit/[id]/edit-form.tsx`, `app/app/worker-nav.tsx`; a small `app/api/app/lang` route + toggle UI; the register form (`register-form.tsx`) for W1/W4 RU labels; `add-worker.ts`/`workers.ts` for the new `lang` column + `setWorkerLang`.
**Decision:** hand-rolled dictionary with **three locales (`ru`/`en`/`he`)** + per-worker `lang` (default `ru`) + a visible toggle. No pluralization/interpolation engine beyond simple `${}` substitution — YAGNI. This is the anchor item; W1, W4, U3 all fold their RU labels into this dictionary.
**Open Q:** none — resolved (toggle + 3 locales; `he` completed progressively).

### U2 — Collapse the shift instruction, make it openable with other info
**Root confirmed:** in `checkin-client.tsx:141-145` the template `instructions` render **inline and always expanded** next to each shift's Check-in button; address/contacts are not currently surfaced there.
**Approach:** Wrap the instruction (plus address and contact) in a collapsible disclosure (native `<details>`/`<summary>` or a small toggle) per shift card, collapsed by default, with a "Details / Инфо" affordance next to the start button. Populate it with: instructions, place address, and contact phone (pull place fields — `contact`, address/coords — into the checkin page's per-item data; `checkin/page.tsx` builds the `items`).
**Files:** `packages/web/app/app/checkin/checkin-client.tsx` (the card body L133-156, the disclosure), `packages/web/app/app/checkin/page.tsx` (thread place address/contact into `items`).
**Decision:** native `<details>` (zero JS, accessible) unless the design needs animation. Collapsed by default so the start button is the focal point.
**Open Q:** Which contact — the place `contact`, or a general company number? And do we want a tap-to-navigate (Waze/Maps) link in the details (we already have `wazeUrl`/`googleMapsUrl` in `places.ts`)?

### U3 — Russian button labels, slightly larger
**Root confirmed:** buttons are `bg-gray-900 px-4 py-2 text-sm ...` reading "Check in" / "Check out" (`checkin-client.tsx:160-175`).
**Approach:** Via U1's dictionary, render "Начать смену" (start) / "Завершить смену" (end); bump sizing (e.g. `px-5 py-3 text-base`, full-width on the card or a larger tap target). Keep the busy state ("Saving…" → "Сохранение…").
**Files:** `packages/web/app/app/checkin/checkin-client.tsx:160-175`.
**Decision:** labels come from the i18n dictionary (not hardcoded RU), so EN/HE fallbacks are trivial. Slight size bump only — no full button redesign.

### U4 — Compact stacked layout for multiple assigned shifts
**Root confirmed:** multiple shifts render as a flat `<ul>` of equal cards (`checkin-client.tsx:124-180`); nothing highlights "which to activate now."
**Approach:** Lay the shifts out compactly stacked and make the **currently-actionable** one prominent: sort so the shift whose window is active/imminent is on top and visually emphasized (larger card / accent), the rest compact/secondary. Reuse the existing per-shift open/closed state and the shift window (start/end) to decide "now." A currently-open (checked-in) shift or the next-to-start shift is the highlighted "activate now" card.
**Files:** `packages/web/app/app/checkin/checkin-client.tsx` (ordering + card emphasis), possibly `checkin/page.tsx` (sort the `items` by proximity to now).
**Decision:** ordering + emphasis, not a new component. Ponytail: no drag/reorder, no calendar — just "the one you act on now is obvious."
**Open Q:** Define "now to activate" precisely — currently-open first, then the shift whose start is nearest (within grace)? Confirm the priority.

---

## Area 8 — Reports (large)

Current state (all confirmed): `packages/web/app/admin/reports/reports-client.tsx` offers 4 types (`hours_employee`, `hours_location`, `payroll`, `exceptions`) with **single-select** `location` and `employeePhone` dropdowns and a date range; the route `api/admin/reports/route.ts` runs the matching `worklog-core/data/reports.ts` primitive (`hoursByEmployee`, `hoursByLocation`, `attendanceExceptions`, `filterAttendanceForReport`) and writes **one flat tab** via `writeReportTab(gateway, tab, header, rows)`. Post-Firestore, `writeReportTab` still works: a "tab" maps to a Firestore doc-with-rows collection via the gateway. Hours per shift come from `Attendance.hours` (computed `hoursBetween(checkInAt, checkOutAt)` — the **same** hours source attendance uses, so an overnight 17:00→07:00 shift correctly reads 14h), joined by `employeePhone`→worker, `instanceId`→instance→`location`.

**PM answer (resolved) — deliverable is a downloadable multi-sheet `.xlsx` workbook.** The PM supplied the example workbook. The three new reports produce a **single `.xlsx` workbook with multiple sheets**, generated **server-side** and returned as a file download — NOT per-target Firestore tabs / CSV. The route returns the workbook with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="report ….xlsx"`; the client triggers the download. **The old `writeReportTab`-to-storage step is NOT used for these three new reports.** (The four legacy types keep their existing single-tab + client-CSV path unchanged.)

- **Dependency:** add **`exceljs`** (actively maintained on npm; good multi-sheet + buffer output) to `packages/web`. The **pure data builders stay in `worklog-core`** (produce arrays-of-arrays / structured rows per sheet — fully testable, no exceljs dependency in core); the **web route** assembles the exceljs workbook from those structured rows and returns the buffer.

### R1 — Three new report types (exact sheet layouts from the PM's workbook)
Each is a new `type` in the route + a new pure `worklog-core` builder. The exact layouts, taken from the PM's file (three sheet shapes):

**A) "Object" report (`report_by_object`) — ONE sheet per selected place (sheet name = place name):**
- A **title cell** with the place name.
- **Header row:** `Date | Name | Start time | End time | Total`.
- **Body:** iterate every date in the selected range; for each date list that place's shifts as rows `date | worker name | start (HH:MM) | end (HH:MM) | hours`. Show the date only on the **first** shift row of the date (blank on subsequent rows for the same date).
  - *Ponytail:* do **NOT** replicate the example's fixed 4-empty-slot-per-day padding — that is a manual-template artifact. List the **actual** shifts only.
- **Totals block** (after the body): one row per worker who worked at this place `worker name | total hours`, then a **grand total** row (sum of all hours). (Example: Victor 98, Igor 116, Alex 21 → grand total 235.)

**B) "Worker" report (`report_by_person`) — ONE sheet per selected worker (sheet name = worker name):**
- A **title cell** with the worker name.
- **Header row:** `Date | Place | Start time | End time | Total`.
- **Body:** every date in range; per shift `date | place | start | end | hours` (overnight e.g. 17:00→07:00 = 14h — from `Attendance.hours`, the same hours source as attendance).
- **Totals block:** one row per place the worker worked `place | total hours`, then a **grand total** row. (Example: Place1 14, Place2 7, Place3 14, Place4 9 → grand total 44.)

**C) "Summary / Pivot" report (`report_summary`) — ONE sheet:**
- **Title:** "Client / Selected places".
- **Header row:** `Date | Place | Hours | Rate | Total amount`.
- **Body:** bucket the selected range **by month**; for each month × each selected place: `month-label | place | hours | rate | amount` where `amount = hours × rate` and `rate` = the place's rate (`Place.baseRate`). *Note (S4):* per-assignment rates do NOT change this object-level rate — the summary is deliberately **object-level**, so `baseRate` is the correct number here; the per-object/per-worker reports carry the real worked hours. (Example rates: Place1 40, Place2 50, Place3 60, Place4 70.)
- **Per-place rollup** (after the monthly body): `place | total amount` (summed across months), then a **grand total** row. (Example: Place1 29600, Place2 39500, Place3 36000, Place4 57050 → grand 162150.)

**Report-type → sheets mapping (R3):** a "by object" report with N selected places → N "Object" sheets (optionally plus the summary sheet); "by worker" with M workers → M "Worker" sheets; the summary is a single sheet. Every selected target gets its **own sheet in the one workbook**.

**Files:** `packages/worklog-core/src/data/reports.ts` (three new pure builders + tests — produce structured per-sheet rows; keep them pure), `packages/web/app/api/admin/reports/route.ts` (wire the new types, extend `VALID_TYPES`, build the exceljs workbook, return the file download), `packages/web/app/admin/reports/reports-client.tsx` (type list + labels + multi-select + download trigger), `packages/web/package.json` (add `exceljs`).
**Decision:** pure builders in `worklog-core` (testable, no exceljs); the web route assembles the workbook and returns the buffer. The summary's per-object rate uses place `baseRate` (object-level, per PM). Keep all computation in the pure builders; the route only assembles sheets + formatting.
**Open Q:** none — the PM supplied the workbook; the layouts above are authoritative.

### R2 — Select multiple places AND multiple workers
**Approach:** Replace the single-value `location`/`employeePhone` selects (`reports-client.tsx:123-145`, currently `useState('')` each) with **multi-select** (checkbox lists or a multi-select control), sending `locations: string[]` and `employeePhones: string[]` to the route. Extend `filterAttendanceForReport` (`reports.ts:60-68`) to accept arrays (`location?: string` → `locations?: string[]`), or add an array-aware filter. Route parses arrays instead of scalars (`route.ts:40-41`).
**Client grouping (resolved):** `Place` **HAS a `client` field** (`places.ts` `Place.client`, backed by the `client` column). So "all places of a client" is a **feasible selection filter** — include it as a selection option (pick a client → auto-selects its places), alongside the hand-pick multi-select. Both feed the same `locations: string[]` payload.
**Files:** `reports-client.tsx` (multi-select UI + a client picker that expands to its places + payload), `api/admin/reports/route.ts` (parse arrays), `reports.ts` (`filterAttendanceForReport` array support).
**Decision:** empty selection = "all" (preserve current behavior). Two selection modes on the client: (a) **pick a client** → its places (derived from `Place.client`), (b) **hand-pick** multiple objects. Both resolve to `locations: string[]`.
**Open Q:** none — `Place.client` exists; client-grouping is a supported selection mode.

### R3 — One SHEET per object or per worker (multi-target `.xlsx` workbook)
**Resolved:** the PM's examples are **one `.xlsx` workbook with multiple sheets**, so each object/worker becomes its **own sheet inside a single downloadable workbook** (not a Firestore tab / separate file). This supersedes the earlier "per-target tab + CSV" model for the three new reports.
**Approach:** For `report_by_object`/`report_by_person` with N selected targets, the pure builder returns **N structured sheet payloads** (arrays-of-arrays or structured rows per sheet); the web route builds an **exceljs** `Workbook`, adds one `Worksheet` per payload (sheet name = place / worker name, sanitized to Excel's 31-char + illegal-char rules), and streams the workbook buffer back as a file download. The **summary** report is a **single** sheet in the workbook. See R1 for the exact per-sheet layouts.
**Files:** `packages/web/app/api/admin/reports/route.ts` (assemble the exceljs workbook from the builder payloads + return the download), `packages/web/app/admin/reports/reports-client.tsx` (a **Download** button that fetches the workbook as a blob and saves it), `packages/worklog-core/src/data/reports.ts` (the three pure builders produce per-sheet structured rows; `writeReportTab` is **not** used for these three), `packages/web/package.json` (`exceljs`).
**Decision:** real multi-sheet `.xlsx` via **exceljs** (server-side, buffer output). One sheet per target for the two detailed reports; a single summary sheet. Keep the builders pure (no exceljs in `worklog-core`); the route owns workbook assembly + the `Content-Type`/`Content-Disposition` download headers. The four legacy report types keep their existing single-tab + CSV path.
**Open Q:** none — confirmed multi-sheet `.xlsx`; `exceljs` is the chosen writer.

---

## Open questions for the PM (roundup)

**Resolved in this batch (PM answered):**
- **Reports deliverable (R1/R2/R3).** PM supplied the example workbook → downloadable **multi-sheet `.xlsx`** via **`exceljs`**; exact per-sheet layouts captured in R1; `Place.client` enables client-grouped selection (R2); one sheet per target in one workbook (R3).
- **i18n (U1).** Language **toggle** across **RU / EN / HE**; per-worker `lang` column (default `ru`) + a visible toggle; `he` completed progressively.
- **Birthdate (W2).** PM has the DOBs and enters them via profiles → `birthdate` editable on **create AND edit** (worker-card); no bulk back-fill.
- **PM confirmed the spec defaults** (no change needed) for: S4 per-assignment rate migration (empty = fallback, no back-fill); S1 already-orphaned Gedera → one-shot repair; Bot2 tap-to-call (E.164); A1 checkout hard-block; map names per shift; RU alert wording.

_All batch-6 open questions are now resolved; no pending PM examples remain._

---

## Testing (house rule)
Every item ships with unit + integration coverage. Pure `worklog-core` additions (cascade helpers, `resolveAssignmentRate`, the three report builders, `ageFromBirthdate`, `formatTemplateOffer` copy, i18n `t()`) → Node test runner, TDD. Route/UI changes (geofence-checkout block, reports multi-select/multi-tab, map join, forms) → typecheck + build + route-level tests. A `test(review):` pass per the CLAUDE.md gate before review.
