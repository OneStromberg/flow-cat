# Instant-Return + Background-Refresh for Worker Screens — Design

**Date:** 2026-07-19
**Status:** Approved (brainstorming) — pending plan
**Goal:** The worker screens (Checkin, Hours, Profile) show their last-seen data **instantly** when you navigate back to them, then **refresh live in the background** (stale-while-revalidate). Plus a global router-cache tweak so back-navigation is instant everywhere.

Follows the navigation-responsiveness work (the `loading.tsx` skeletons). This slice removes the remaining "screen freezes on every visit" feeling for the screens guards use daily.

## Problem (current state)
Each worker screen is a `force-dynamic` **server component** that re-reads Firestore on **every** navigation (e.g. `app/app/hours/page.tsx` does `requireWorker` + `loadQuestions` + `listWorkerEntries` + `listAttendance` + `listInstances` over **all dates**). `force-dynamic` opts out of client caching, so returning to a screen re-runs all of it from scratch → the freeze. `loading.tsx` now shows a skeleton, but the data still isn't remembered between visits.

## Locked decisions
| # | Decision | Choice |
|---|---|---|
| 1 | Approach | **A + C together** — global router-cache tuning (A) AND SWR stale-while-revalidate on the worker screens (C). |
| 2 | Scope | **Worker screens only:** Checkin, Hours, Profile. Admin screens get Part A only. |
| 3 | Data-fetch library | **`swr`** (small, purpose-built, Vercel). |
| 4 | Cross-navigation cache | **sessionStorage-backed SWR cache** — cached data survives navigation within the session. |

## Part A — Router-cache tuning (global, ~free)
- `packages/web/next.config.ts`: add `experimental: { staleTimes: { dynamic: 30, static: 180 } }` (seconds). Next keeps each visited route's RSC payload client-side, so back-navigation within the window is instant (no refetch, no skeleton).
- Global by nature → admin screens also gain instant-back as a bonus; the 30s window keeps staleness mild.
- **Validation required:** confirm `staleTimes` actually engages for these `force-dynamic` routes on a production build (experimental flag). If it does not, Part C still delivers the worker-screen behavior; document the finding.

## Part C — SWR stale-while-revalidate on the 3 worker screens

### C1. Data layer (extract + make testable)
Move each screen's Firestore-loading out of its page into a pure, serializable loader:
- `packages/web/lib/data/worker-hours.ts` → `loadHoursData(gw, worker): Promise<HoursData>` (entries + total + question config + closed attendance with resolved locations). **Scope the `listInstances` call** to the dates actually needed instead of all-time.
- `packages/web/lib/data/worker-profile.ts` → `loadProfileData(gw, worker): Promise<ProfileData>`.
- `packages/web/lib/data/worker-checkin.ts` → `loadCheckinData(gw, worker): Promise<CheckinData>` (today's instances + attendance status — the shift list the checkin client displays).
Each returns **JSON-serializable** data. Unit-tested with `createMemoryGateway`.

### C2. Endpoints
- `packages/web/app/api/worker/hours/route.ts`, `.../profile/route.ts`, `.../checkin/route.ts` — each a `GET` that calls `requireWorker()` (session-cookie auth; 401 if absent/inactive) → the matching `load…Data(getGateway(), worker)` → `Response.json(data)`. `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.

### C3. SWR provider + sessionStorage cache
- `packages/web/lib/swr-session-cache.ts` — a Map-like cache seeded from `sessionStorage` on load and flushed back on `beforeunload` (SWR's documented persistence pattern; SSR-guarded).
- `packages/web/app/app/swr-provider.tsx` (`'use client'`) — `<SWRConfig value={{ provider: sessionStorageProvider, keepPreviousData: true, revalidateOnMount: true, revalidateOnFocus: true }}>`. Mounted in `packages/web/app/app/layout.tsx` wrapping `{children}`, so it covers all worker screens.

### C4. Screen conversions
Each screen becomes a thin shell rendering a client component that reads its endpoint via `useSWR`:
- **Hours** — `app/app/hours/hours-client.tsx` (`'use client'`): `useSWR('/api/worker/hours', fetcher)` → renders the same markup as today from the SWR data; builds form widgets client-side from the returned question config. `page.tsx` renders `<HoursClient/>`.
- **Profile** — `app/app/profile/profile-client.tsx`: same pattern.
- **Checkin** — feed the existing `checkin-client.tsx` its shift-list data via `useSWR('/api/worker/checkin', fetcher)` instead of server props. The existing check-in/out **action flow (geolocation, selfie capture, POST `/api/checkin`) is unchanged** — only the display data becomes SWR-backed. This is the most delicate conversion; do it last and verify the action flow still works.

**Behavior:** on return to a screen, SWR renders the sessionStorage-cached data **instantly** (no freeze), fires the background `GET`, and **swaps in fresh state live** when it resolves. First-ever visit (empty cache) shows the existing `loading.tsx` skeleton, then data.

## Data flow (return to Hours)
tap Hours → SWR reads sessionStorage → renders last data **instantly** → background `GET /api/worker/hours` → `requireWorker` → `loadHoursData` → JSON → SWR updates the view live.

## Files
| File | Change |
|---|---|
| `next.config.ts` | add `experimental.staleTimes` |
| `package.json` | add `swr` |
| `lib/data/worker-hours.ts` · `worker-profile.ts` · `worker-checkin.ts` | **new** — data loaders |
| `lib/data/worker-hours.test.ts` · `worker-profile.test.ts` · `worker-checkin.test.ts` | **new** — unit tests (memory gateway) |
| `app/api/worker/hours/route.ts` · `profile/route.ts` · `checkin/route.ts` | **new** — GET endpoints |
| `app/api/worker/*/route.test.ts` | **new** — route tests (auth + shape) |
| `lib/swr-session-cache.ts` | **new** — sessionStorage SWR cache |
| `app/app/swr-provider.tsx` | **new** — `<SWRConfig>` |
| `app/app/layout.tsx` | wrap children in `<SwrProvider>` |
| `app/app/hours/hours-client.tsx` · `profile/profile-client.tsx` | **new** — SWR client screens |
| `app/app/hours/page.tsx` · `profile/page.tsx` | render the client component |
| `app/app/checkin/page.tsx` · `checkin-client.tsx` | feed shift list via SWR; keep action flow |

## Testing
- **Unit:** `load…Data` for all three screens with `createMemoryGateway` (the Firestore logic + the scoped `listInstances`).
- **Route:** the three GET endpoints — unauthenticated → 401; authenticated worker → correct data shape (mirrors the batch-7 route-test style).
- **Build/type:** `pnpm --filter @scourage/web typecheck && build && test` all green; `sw.js` still generated.
- **Manual:** navigate away from Hours/Profile/Checkin and back → cached data appears instantly, then updates; check-in/out actions still work.

## Non-goals
- Offline **mutations** (check-in still requires network — separate offline-data plan).
- SWR on admin screens (they get Part A only).
- Background sync while the app is backgrounded / not focused.
- Web Push (the queued next slice).

## Risks / notes
- `experimental.staleTimes` may not fully engage with `force-dynamic` — Part C is the load-bearing win regardless; document what A actually does.
- Client-SWR screens give up SSR-rendered data (they render the shell + SWR data); the `loading.tsx` skeleton + sessionStorage cache cover the first paint.
- The **Checkin** conversion is the riskiest (its client component already owns the geo/selfie/POST flow) — convert it last, preserve the action path, and verify end-to-end.
- No new production runtime cost beyond `swr` (tiny) and three thin GET routes that reuse existing gateway logic.
