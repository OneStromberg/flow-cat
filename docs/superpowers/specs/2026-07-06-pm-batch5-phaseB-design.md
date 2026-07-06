# PM Batch 5 — Phase B (smaller features) — Design

**Date:** 2026-07-06
**Goal:** The batch-5 features that have no hard blockers. Ship + deploy, then Phase C (big features).

## Items
1. **Login persists ~a month (feat 5):** `setSessionCookie` (`lib/session.ts`) sets the cookie with no `maxAge` → it's a session cookie (dies on browser close). Add `maxAge: 60*60*24*30` (30 days) so login persists. Confirm the signed session token itself carries no shorter expiry (if `readSession`/`writeSession` embeds an exp, extend it to match or leave it stateless).
2. **Places: sort alphabetically + delete (feat 7):** the places list renders unsorted. Sort by `name` (locale-aware). Add a **delete** control per place → soft-delete (`active='no'`) via a new `deletePlace(gateway, name)` (reuse `updatePlace`/`updateRow`, set active='no'), and hide inactive places from the list (like templates). Confirm.
3. **1-minute check-in→check-out timeout (feat 8):** `checkOut` (`worklog-core/attendance.ts`) has no minimum-duration guard. Reject a checkout that happens < 60s after check-in (`{ ok:false, error:'too_soon' }` / a clear message) — protects against double-taps. (Also foundation for the future "< 10 min shift" alert.)
4. **PWA installable icon (feat 4):** no manifest/icons today. Add a Next.js `app/manifest.ts` (name "FlowCat", standalone display, theme color) + an `app/icon.svg` (simple branded mark) + apple-touch metadata, so the app is installable / "Add to home screen" and the link isn't lost in chat.
5. **Self-registration (feat 1) + city dropdown (feat 2):** a public `/register` page + route that creates a worker via `addWorker` with **places=[]** and **payRate/payStructure empty** (admin fills those later). Collects the fields login needs (name, phone, teudat zeut) + the self-serve profile fields (city, age, transportation, hebrew level, gender, schedule). The **city** field is a dropdown sourced from `loadCities` (the existing Cities tab). After registering, the worker logs in normally (phone + teudat zeut). The account is created **active** (they can log in; they just have no assignable places until admin adds them).

## Decisions / notes
- **City list (feat 2):** the mechanism (registration city dropdown wired to `loadCities`) ships now. The actual list of city names must live in the **Cities** tab — the PM's attached list needs to be populated there (or sent to me to seed). If Cities is empty, the dropdown is empty + a free-text fallback.
- **Self-registration security:** anyone with a phone + teudat zeut can create a worker and log in. That's the intended self-onboarding; access is inert until an admin grants places. Acceptable for a staffing tool; flagged.
- Place delete is **soft** (append-only model); no hard row removal.

## Out of scope (Phase C)
Multi-shift-per-day templates, broadcast-template-with-buttons, geolocation polling + "not on site", the notification set.

## Testing
worklog-core (`deletePlace`, checkout 60s guard): Node test runner, TDD. web (session maxAge, PWA, registration): typecheck + build.
