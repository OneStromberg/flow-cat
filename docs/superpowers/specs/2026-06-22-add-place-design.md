# FlowCat "Add Place" — Design Spec

**Date:** 2026-06-22
**Status:** Approved design — ready for implementation plan
**Project:** `flow-cat` (repo `OneStromberg/flow-cat`, deployed on Vercel)

## 1. Purpose

Let an admin add a work site ("place") through a form with **Google Places
autocomplete by name**, saving the place's **coordinates** (and address +
Google place ID). Saved places are listed on an admin page where each can be
opened in **Waze** or **Google Maps**. The Google Sheet stays the database.
Functional-first styling, consistent with the existing admin surface.

## 2. Key Decisions (locked)

| Decision | Choice |
|---|---|
| Geocoding provider | **Google Maps Platform** (user provisions the key + billing). |
| Autocomplete widget | **`PlaceAutocompleteElement`** (the new element). The legacy `Autocomplete` widget is unavailable to API projects created after March 2025, and this is a new key. |
| Maps JS loading | Google's **official inline bootstrap loader** (`importLibrary`). No new npm dependency. |
| API key env var | **`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`** — used in the browser, so it must be public; referrer-restricted to the Vercel domain. |
| Saved-places surface | A **`/admin/places` list page** (name · address · active · Waze · Google Maps), with the "Add place" button at its top. `/admin` links to it. |
| Navigation buttons | **Both Waze and Google Maps** per row. |
| Save requirement | A place is saved only when a suggestion is **selected** (coords present). No free-typed coordless saves. |
| Place editing/deleting | Out of scope (sheet-only for now). |

## 3. Data Model — Places tab gains columns

Existing Places columns stay: `place_name · active`. New columns (header-driven
append, so order in the sheet is flexible):

| Column | Canonical value |
|---|---|
| `lat` | number (string in the cell) |
| `lng` | number (string in the cell) |
| `place_id` | Google place ID (string) — pins the exact place in Google Maps and enables future re-lookup/dedup |
| `address` | Google formatted address (free text) |

`loadActivePlaces(gateway)` is **unchanged** — the worker add-form still reads
it for its place multi-select.

New `worklog-core` surface:

- **`interface Place { name: string; active: boolean; lat: string; lng: string; placeId: string; address: string }`**
- **`listPlaces(gateway): Promise<Place[]>`** — all rows with a non-empty
  `place_name`, parsed into `Place[]` (active = `active !== 'no'`).
- **`addPlace(gateway, input: AddPlaceInput): Promise<{ ok: true } | { ok: false; errors: Record<string,string> }>`**
  where `AddPlaceInput = { name: string; lat: string; lng: string; placeId: string; address: string }`.
- **`wazeUrl(lat: string, lng: string): string`** — pure. Returns
  `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`.
- **`googleMapsUrl(lat: string, lng: string, placeId: string): string`** —
  pure. Returns `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`
  plus `&query_place_id=<placeId>` when `placeId` is non-empty.

## 4. Architecture & Routes

```
/admin                  gains a "Manage places" link                              [requireAdmin]
/admin/places           list of all places + "Add place" button                   [requireAdmin]
/admin/places/add       Google autocomplete add-place form                        [requireAdmin]
API:
  POST /api/admin/places  create a place (admin-only) → addPlace(gateway, input)   [requireAdmin]
```

All three pages/route are guarded by `requireAdmin` (redirect non-admins to `/`;
the API returns 401 for non-admins). `runtime='nodejs'` + `dynamic='force-dynamic'`
on the pages/route that touch googleapis (matching the existing admin pages).

## 5. Add Place (`/admin/places/add` + `POST /api/admin/places`)

- The page is a server component guarded by `requireAdmin`. It renders a client
  form component (`add-place-form.tsx`).
- The client form:
  1. Loads Maps JS via the official inline bootstrap loader using
     `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, then `await google.maps.importLibrary('places')`.
     If the key is missing/empty, render a clear inline message ("Maps key not
     configured") instead of the widget.
  2. Renders a `PlaceAutocompleteElement` with **no `types` restriction**, so
     suggestions include both **addresses and establishments** (a street
     address or a business/landmark name both autocomplete).
  3. On the element's `gmp-select` event, fetches the place's
     `displayName`, `location` (lat/lng), `formattedAddress`, and `id`, and
     stores them in React state. The selected place is shown as a confirmation
     line (name + address).
  4. Submit is enabled only once a place is selected (coords present). Submit
     POSTs `{ name, lat, lng, placeId, address }` to `/api/admin/places`.
- **`POST /api/admin/places`** is admin-guarded → calls `addPlace(gateway, input)`:
  - **Validates:** `name` required; `lat` and `lng` required **and numeric**;
    duplicate `place_name` (case-insensitive trim match against existing
    Places rows) rejected.
  - **Writes:** header-aligned Places row with `active='yes'` plus the
    name/coords/place_id/address (header-driven: missing columns added once,
    mirroring `addWorker`).
  - Returns `{ ok: true }` or `{ ok: false, errors }`.
- Success → client navigates to `/admin/places` (the new place appears in the list).

## 6. Places List (`/admin/places`)

- Server page (`requireAdmin`) loads all places via `listPlaces(gateway)` and
  renders a table: `place_name`, `address`, active indicator, and two link
  buttons per row — **Open in Waze** (`wazeUrl`) and **Open in Google Maps**
  (`googleMapsUrl`), each opening in a new tab (`target="_blank"`,
  `rel="noopener noreferrer"`).
- A header "**Add place**" button links to `/admin/places/add`.
- Rows with blank/non-numeric coords (legacy places added before this feature)
  render without nav buttons (a "—" placeholder), since there's nothing to
  navigate to.

## 7. Security & Error Handling

- `requireAdmin` on every `/admin/places*` page and the create route: a
  non-admin or logged-out user is redirected (pages) or gets 401 (API).
- Add-place validation errors render inline; duplicate name → a clear message;
  Sheets failure → "couldn't save, try again" (logged server-side).
- The Maps key is `NEXT_PUBLIC_` and referrer-restricted to the Vercel domain —
  public exposure in the browser is expected and standard for Maps JS keys.
- No PII involved (places are not personal data).

## 8. Testing

- **worklog-core:**
  - `addPlace` — each validation case (missing name, missing lat, missing lng,
    non-numeric lat, non-numeric lng, duplicate name) + a success that appends
    the header-aligned row with `active=yes`.
  - `listPlaces` — parses rows into `Place[]`, sets `active` correctly, includes
    coordless legacy rows.
  - `wazeUrl` — exact format.
  - `googleMapsUrl` — with and without `place_id`.
- **web:** The codebase has no route-test harness (web tests glob only
  `lib/**/*.test.ts` of pure functions). The `POST /api/admin/places` route is a
  thin coercion wrapper mirroring the existing untested `workers` route; its
  real logic (validation, dedup, append) is covered by the `addPlace` unit tests
  above. Web verification is `typecheck` + `build`.
- The Google `PlaceAutocompleteElement` widget is external/client-only and is
  not unit-tested.

## 9. Out of Scope (this build) / Future

- Editing, deleting, or deactivating a place from the UI (sheet-only for now).
- A map preview of the selected place on the add form.
- Reverse-geocoding or coordinate entry for legacy coordless places.
- Deduping by `place_id` (we save it now to enable this later).

## 10. Prerequisite (user action)

Reuse the existing Google Maps key (project `story-teller-app-01`) or create a
new one. For it to work in the browser it must have: **application restriction =
HTTP referrers** (NOT Android-app) including `https://flow-cat.vercel.app/*`,
`https://*.vercel.app/*`, and `http://localhost:3000/*`; **API restrictions**
including *Maps JavaScript API* and *Places API (New)*; and both of those APIs
**enabled** on the project (billing on). Add it to Vercel as
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. All code is independent of this and can be
built/tested with a placeholder key (only the live autocomplete needs the real key).
