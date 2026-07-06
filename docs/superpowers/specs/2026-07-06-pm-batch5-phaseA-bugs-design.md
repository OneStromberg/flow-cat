# PM Batch 5 — Phase A (reliability bugs) — Design

**Date:** 2026-07-06
**Goal:** Fix the 4 reliability bugs (0–3) that are breaking daily use. Ship + deploy before the feature phases (B/C). Sequencing per PM: bugs first.

## Root causes (investigated)

Three of the four bugs share ONE root cause: **the primary Sheets write's success is coupled to a heavy, quota-prone follow-on step (`generateInstances`), and that coupling is handled two wrong ways.**

- **#1 (false "couldn't save", but it saved):** routes do `await save(); await generateInstances()`. `generateInstances` does many reads+appends and hits the Sheets 60/min quota; when it throws, the route's `catch` returns **503 "action failed"** — even though `save()` already landed. The user sees an error; the row is there. Files: `api/admin/shifts/route.ts` (addTemplate), `.../copy/route.ts`, `.../shifts/[id]/route.ts`.
- **#3 (template-assigned shifts stay yellow — Театрон Гиватаим, all Big Gedera):** `api/admin/shift-assignments/route.ts:32` re-seeds with `generateInstances(gw, today).catch(...)` — **fire-and-forget, not awaited**. `router.refresh()` runs before seeding finishes; and if the seed throws partway (quota), the `.catch` **swallows it silently**, so those templates' existing instances never get the assignment → permanent yellow.
- **#2 (assigned worker doesn't appear until manual refresh):** the assign route (`api/admin/shift-instances/[id]/route.ts`, action `assign`) awaits `assignManual` and returns ok correctly; the gap is the **client** — `instances/[id]/instance-detail.tsx` doesn't `router.refresh()` (or does an incomplete optimistic update) after a successful assign/remove, so the new chip isn't shown until a hard refresh.
- **#0 (can't open "Roma Test"):** the worker card is addressed by **phone** (`/admin/workers/[phone]`), which is neither unique nor guaranteed non-blank (two "Alex" rows already share `972559459844`). A blank or duplicate phone makes the list link 404 or open the wrong worker. There is no stable worker `id` — phone is the key everywhere (assignments reference phone).

## Fixes

### Fix A — decouple primary save from seeding (unifies #1 + #3)
A shared principle: **the primary write reports success on its own; seeding runs reliably but its failure is a soft warning, never a false save-failure, and never silently swallowed.**

- Add a **targeted, awaited** seeder `seedTemplateInstances(gateway, templateId, today, horizonDays=42)` in `shift-instances.ts` — same logic as `generateInstances` but scoped to ONE template (create missing instances + seed active recurring assignments into existing+new instances within the horizon). Idempotent (same id/assign-key guards). Lighter than a full run → far less likely to hit quota. Unit-tested.
- **`shift-assignments/route.ts` (addRecurring/removeRecurring):** replace the fire-and-forget `generateInstances(...).catch()` with `await seedTemplateInstances(gw, templateId, today)` wrapped in try/catch. On success → `{ ok:true }`. On seed failure → `{ ok:true, seedWarning:true }` (HTTP 200) + `console.error`. The primary recurring add/remove already succeeded before this. Fixes yellow shifts (awaited + targeted + reliable) AND surfaces failure instead of swallowing.
- **addTemplate / copy / shift[id] routes:** keep `await save()`; move the follow-on `generateInstances` into its own try/catch so a seed/generate failure returns `{ ok:true, seedWarning:true }` (200), NOT 503. The save's success is what the response reports. (These can keep the full `generateInstances` — a new/edited template legitimately needs a broad pass; wrapping it just stops it from masking the save.)
- **Client:** where a route may return `seedWarning`, show the save as **succeeded** with an optional soft note ("Saved. Staffing sync is catching up — refresh in a moment."). Do NOT show a red error. Fixes the false "couldn't save."

### Fix B — refresh after assign/remove (#2)
In `instances/[id]/instance-detail.tsx`, the assign and remove handlers must `router.refresh()` (awaited) after a successful response, mirroring `template-detail.tsx`. If an optimistic local update exists, keep it but reconcile with the refresh. Verify the assign/remove POST path returns before refreshing.

### Fix C — worker addressability + phone hygiene (#0)
- **Enforce non-blank phone on UPDATE** (add already requires it): the worker update route/`updateWorker` must reject a blank phone, and reject a phone that **collides** with a different existing worker (uniqueness). Prevents new blank/dup rows.
- **Repair path for existing broken rows:** the workers list (`admin/page.tsx` / its client) detects rows with a **blank phone** or a **phone shared by >1 row** and renders an inline **"Fix phone"** control on those rows → POSTs `{ token, phone }` to a small route that updates the worker **matched by its unique `token`** (server-side; token stays out of any shareable URL). This lets the admin repair "Roma Test" without opening the broken card.
- Keep the worker card keyed by phone for now (a full worker-`id` re-key is out of scope for a bug phase — flagged as a Phase-B/C consideration). Once phones are unique+non-blank, the card is addressable for every worker.

## Out of scope (later phases)
All features + notifications from batch 5 (self-registration, city list, multi-shift/day templates, PWA, session length, geoloc, sort/delete places, min timeout, broadcast-template-with-buttons, the notification set). Phase A is bugs only.

## Open input
Roma Test's actual phone value (blank vs duplicate) — Fix C covers both, but it'll confirm which path repaired it.

## Testing
worklog-core (`seedTemplateInstances`, update-phone validation): Node test runner, TDD. web: typecheck + build; the route/client changes verified by build + the seed unit test.
