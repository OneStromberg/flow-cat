# PWA Installability + Install Button — Design

**Date:** 2026-07-19
**Status:** Approved (brainstorming) — pending plan
**Goal:** Make FlowCat an installable PWA with an offline app shell, and add an in-app **"Install app"** button so workers (Android primary) can install it to their home screen from the browser.

This is the first self-contained slice of the mobile direction sketched in
`2026-07-19-mobile-push-geolocation-discovery.md`. It deliberately stops at **installability + offline shell**. Web Push, offline *data*, location integrity, and Capacitor/background-GPS are **separate plans**.

## Locked decisions
| # | Decision | Choice |
|---|---|---|
| 1 | PWA scope | **Installable + offline shell** — installs & runs full-screen; app shell cached so it opens (with a graceful offline screen) without signal. Live data still needs network. |
| 2 | Install-button placement | **Login page + worker `/app`** — the button self-hides when not applicable, so both mounts are safe. Admins unaffected. |
| 3 | iOS handling | **"Add to Home Screen" guide sheet** — iOS Safari has no programmatic install, so the button opens an i18n'd instructions sheet (Share → Add to Home Screen). |
| 4 | Icons | Derive a committed PNG set from the existing `app/icon.svg` (cat-clock logo). No new branding. |
| 5 | Service worker | **Serwist (`@serwist/next`)** — build-time precache of the hashed app shell, versioned cleanup, offline fallback, and the future home for Web Push handlers. |

## Non-goals (explicit — separate plans)
- Web Push / notifications (discovery-doc items 1–3).
- Offline **data** (check-in works with no signal + sync).
- Location integrity — `accuracy`/`timestamp`/mock detection (items 4–6).
- Capacitor / background geolocation (item 7).

## Scope boundary
All changes live in **`packages/web`**. **No `@scourage/worklog-core` changes** — this is pure client / build / PWA plumbing. No new API routes, no Firestore, no data-layer changes.

## Architecture — four components

### A. Service worker (Serwist)
- Add dev-dependencies `@serwist/next` + `serwist`.
- Wrap `next.config.ts` with `withSerwist({ swSrc: 'app/sw.ts', swDest: 'public/sw.js', disable: process.env.NODE_ENV === 'development' })`. **Disabled in dev** so `next dev` is never poisoned by SW caching (consistent with the "never build in a live dev worktree" rule — the SW is a production-build artifact only).
- `app/sw.ts`: install a Serwist instance with `defaultCache` runtime caching + the injected precache manifest (`self.__SW_MANIFEST`) for the app shell; `skipWaiting` + `clientsClaim` for prompt updates; register a navigation **offline fallback** to `/~offline`.
- `app/~offline/page.tsx`: a static, self-contained "You're offline" screen (branded, i18n'd, no data fetch) shown when a navigation request fails with no cache.

### B. Icon set
- Rasterize `app/icon.svg` (512×512 cat-clock on `#111827`) into committed static PNGs under `public/`:
  - `icon-192.png`, `icon-512.png` (standard, `purpose: any`)
  - `icon-192-maskable.png`, `icon-512-maskable.png` (`purpose: maskable` — cat scaled into the ~80% safe zone on a full-bleed `#111827` background so Android's mask never clips it)
  - `apple-touch-icon.png` (180×180, for iOS home screen)
- Generation is an **author-time** step: a dev-only `sharp`-based script (`scripts/gen-icons.mjs`) run once; the resulting PNGs are committed as static assets. **No runtime rasterization.**
- Update `app/manifest.ts` `icons[]` to list the PNGs (keep the SVG as a supplemental `any` entry). Manifest otherwise unchanged (name/short_name/theme/display already correct).

### C. `<InstallButton/>` (client component)
Self-hiding button that renders per platform/state:
- **Installed** (`matchMedia('(display-mode: standalone)').matches` OR iOS `navigator.standalone === true`) → renders `null`.
- **Android / Chromium** → listens for `beforeinstallprompt`, calls `preventDefault()`, stashes the event; shows **"Install app"**; on tap calls `deferredPrompt.prompt()`, awaits `userChoice`, hides on `accepted`. (The button appears *reactively* when the browser fires the event.)
- **iOS Safari** (not standalone, no `beforeinstallprompt`) → shows **"Install app"**; on tap opens the **A2HS guide sheet** (Share-icon illustration + "Add to Home Screen" steps), i18n'd.
- **Desktop / unsupported** → renders `null`.
- No auto-popup, no dismissal persistence — the button simply disappears once installed. Also listens for the `appinstalled` event to hide immediately.

### D. `<ServiceWorkerRegister/>` (client component)
Registers `/sw.js` on mount (guarded by `'serviceWorker' in navigator` and production only). Mounted **once** in the root layout.

## Detection logic (pure + unit-tested)
Extract the platform/state branching into a pure helper so it's testable without a DOM:
```ts
// packages/web/lib/pwa-install.ts
export type InstallPlatform = 'installed' | 'android' | 'ios' | 'unsupported';
export function detectPlatform(nav: {
  userAgent: string; standalone?: boolean;
}, isStandaloneDisplay: boolean): InstallPlatform;
```
- `installed` when `isStandaloneDisplay` or `nav.standalone === true`.
- `ios` when the UA is iOS Safari (iPhone/iPad, WebKit) and not installed.
- `android` when Chromium/Android (candidate for `beforeinstallprompt`).
- `unsupported` otherwise (desktop, Firefox mobile, etc.).
The `<InstallButton/>` composes `detectPlatform(...)` with live `beforeinstallprompt`/`appinstalled` events (which the helper can't model) to decide its final render.

## Wiring / files
| File | Change |
|---|---|
| `packages/web/next.config.ts` | wrap with `withSerwist(...)` |
| `packages/web/app/sw.ts` | **new** — Serwist SW source |
| `packages/web/app/~offline/page.tsx` | **new** — offline fallback screen |
| `packages/web/app/manifest.ts` | add PNG `icons[]` |
| `packages/web/public/icon-*.png`, `apple-touch-icon.png` | **new** — committed PNGs |
| `packages/web/scripts/gen-icons.mjs` | **new** — author-time icon generator (dev-only `sharp`) |
| `packages/web/lib/pwa-install.ts` | **new** — `detectPlatform` |
| `packages/web/lib/pwa-install.test.ts` | **new** — unit tests |
| `packages/web/app/components/install-button.tsx` | **new** — `<InstallButton/>` + A2HS sheet |
| `packages/web/app/components/service-worker-register.tsx` | **new** — `<ServiceWorkerRegister/>` |
| `packages/web/app/layout.tsx` | mount `<ServiceWorkerRegister/>` |
| `packages/web/app/login/page.tsx` (or its form) | mount `<InstallButton/>` |
| `packages/web/app/app/layout.tsx` | mount `<InstallButton/>` in the worker shell |
| `packages/web/lib/i18n/strings.ts` | add `install.*` keys (button label, A2HS steps) EN + RU (+ optional HE) |

## Testing
- **Unit** (node test runner): `detectPlatform` across installed / android / ios / desktop UAs + standalone-display combinations; any other pure helper.
- **Build/type**: `pnpm --filter @scourage/web typecheck && build && test` all green.
- **Manual device acceptance** (the parts a DOM can't unit-test):
  1. Android Chrome → "Install app" appears → install → app opens standalone → button gone.
  2. iOS Safari → "Install app" → guide sheet with correct steps.
  3. Installed app opens the shell **offline** (airplane mode) and the `/~offline` fallback renders for uncached navigations.
  4. Desktop browser → no button.

## Risks / notes
- `beforeinstallprompt` fires only after Chrome's manifest+SW+engagement heuristics are met — the Android button is reactive and may need a moment / second visit. Acceptable and expected.
- HTTPS is required for SW + install; Vercel is HTTPS, `localhost` counts as secure for testing.
- Serwist runs only in the production build (disabled in dev), so local `next dev` is unaffected; validate the SW on `next start` or a preview/prod deploy.
- Icons are committed static PNGs — no runtime image work, no new production dependency (`sharp` is dev-only, used once to generate assets).
- i18n copy for the A2HS sheet + button goes through the existing `strings.ts` dict (EN + RU required by the exhaustive `Record<StringKey,string>`; HE optional).
