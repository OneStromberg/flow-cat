# FlowCat Worker App — Auth + Review + Edit Design Spec

**Date:** 2026-06-21
**Status:** Approved design — ready for implementation plan
**Project:** `flow-cat` (repo `OneStromberg/flow-cat`, deployed on Vercel)

## 1. Purpose

Replace the one-time `/w/<token>` magic link with a **shared, authenticated worker
app**. A worker opens one URL, logs in with **phone + teudat zeut** (both matched
against the sheet), then can:
- **enter** a new work entry (the existing form),
- **review** their own logged hours, and
- **edit** their unlocked entries (locked entries are read-only).

The Google Sheet remains the database. This build is **functional-first** (clean
Tailwind styling); the polished FlowCat visual + multi-shift features are a
separate later plan.

## 2. Key Decisions (locked)

| Decision | Choice |
|---|---|
| Access | Shared `/login` page (phone + teudat zeut); **replaces** the per-worker `/w/<token>` magic link. |
| Second factor | **teudat zeut**, exact-match (trimmed) against a `teudat_zeut` column. Knowledge factor — adequate for an internal tool (noted, not strong auth). |
| Session | **Session cookie** (no expiry → cleared when the browser closes), HttpOnly + Secure, **HMAC-signed**, holds only the worker's phone. |
| Cookie signing key | **No new env var required.** Derived (one-way) from the existing `GOOGLE_SERVICE_ACCOUNT_JSON` secret; an optional `SESSION_SECRET` env var overrides it if ever set. |
| Worker abilities | Enter new entry · review own hours · **edit** unlocked entries. No delete. |
| Locked entries | Admin sets a `locked` column on `WorkLogs`; worker sees those read-only. |
| Old entries (no `id`) | Shown in review but **not editable** (nothing to target). No backfill in v1. |
| Styling | Clean Tailwind (functional-first). FlowCat visual + multi-shift = next plan. |

## 3. Architecture — pages & routes

```
/login                      shared page: phone + teudat zeut form
/app                        authed home: greeting + "New entry" form + "My hours" list
/app/edit/[id]              edit one unlocked entry

API (all server-side; Sheets access never reaches the browser):
  POST  /api/login          match phone + teudat zeut → set signed session cookie
  POST  /api/logout         clear the cookie
  POST  /api/submit         create entry — identity from SESSION (no token in body)
  PATCH /api/entries/[id]   edit an entry (must be owned by session worker + not locked)
```

The old `app/w/[token]/` page + its form are **removed**; the entry form moves
into `/app`. The Workers `token` column becomes unused (left in place, harmless).

### Server helper: `requireWorker()`
Reads + verifies the session cookie, returns the authenticated worker (loaded
fresh from the sheet by phone). Used by every `/app*` server component and every
protected API route. Missing/invalid → redirect to `/login` (pages) or `401` (API).

## 4. Auth & session

- **Login (`POST /api/login`):** body `{ phone, teudatZeut }`. Normalize phone →
  `findWorker(gateway, phone)` → require `active` AND `worker.teudatZeut === teudatZeut.trim()`.
  On success, set the session cookie. On any mismatch, return a single generic
  error ("Phone number or teudat zeut didn't match") — never reveal which field.
- **Session cookie:** name `fc_session`; value = `base64url(payload) + "." + hmac`,
  where `payload = { phone, iat }` and the HMAC-SHA256 is keyed by the **signing key**.
  Flags: `HttpOnly; Secure; SameSite=Lax; Path=/` and **no `Max-Age`/`Expires`**
  (session cookie → cleared on browser close). The cookie holds **only the phone**.
- **Signing key (no new env var):** `getSigningKey()` returns `process.env.SESSION_SECRET`
  if set, else derives a stable key as `HMAC-SHA256("flowcat-session", <service-account
  private_key from GOOGLE_SERVICE_ACCOUNT_JSON>)`. The SA private key is high-entropy and
  server-only, so the derived key is secure and requires **zero new configuration**.
  (Rotating the SA key invalidates live sessions — negligible, since they're
  browser-close session cookies and the worker just logs in again.)
- **`session.ts` lib (worklog-core or web/lib):**
  - `createSession(phone: string, secret: string): string` — signs the cookie value.
  - `readSession(value: string, secret: string): { phone: string } | null` —
    verifies the HMAC (constant-time) and parses; returns null on tamper/format error.
- **teudat zeut is PII:** only read in the login POST body, only compared
  server-side, **never logged, never stored in the cookie, never sent to the client.**
- **Logout (`POST /api/logout`):** sets the cookie to empty with `Max-Age=0`.

## 5. Data model — sheet changes

| Tab | New column | Meaning |
|---|---|---|
| **Workers** | `teudat_zeut` | the worker's ID number; second login factor |
| **WorkLogs** | `id` | stable unique id per entry, generated on create (e.g. `randomBytes(9).base64url`) — targets a row for editing |
| **WorkLogs** | `locked` | admin sets `yes` → entry frozen, worker sees it read-only |

- `findWorker`/`buildWorker` parse `teudat_zeut` into `Worker.teudatZeut`.
- `appendWorkLog` now also writes an `id` (generated) and a blank `locked`. So the
  `WorkLogs` header gains `id` (before the question keys, after `name`) and `locked`
  (at the end). The header-driven writer keeps historical columns intact.

## 6. Review + edit

### Review (`/app`)
The `/app` server component loads the worker (via `requireWorker`), then
`listWorkerEntries(gateway, worker.phone)` → this worker's `WorkLogs` rows
(filtered by the `phone` column), newest first, plus a simple **total of hours
shown**. Each row renders date · place · start · end · hours, with an **Edit**
link when unlocked and a 🔒 read-only state when `locked` is truthy or the row has
no `id`.

### Edit (`/app/edit/[id]` + `PATCH /api/entries/[id]`)
- The edit page loads the entry via `getEntry(gateway, id)`, confirms it belongs
  to the session worker and is unlocked, and renders the same field widgets
  pre-filled.
- `PATCH /api/entries/[id]` (session-authed): `updateEntry(gateway, id, answers, worker, questions, tz, now)`:
  1. read `WorkLogs`; find the data row whose `id` matches (its **sheet row number
     = array index + 1**, since array[0] is the header).
  2. **refuse** (403) if the row's `phone` ≠ session worker's phone, or `locked` is truthy.
  3. validate the answers (reuse `validateAnswers`), recompute hours
     (`buildWorklogRecord`), preserve `id` + `logged_at`, set `locked` unchanged.
  4. `gateway.updateRow('WorkLogs', sheetRow, alignedRow)`.

### New `sheets-helper` capability
`updateRow(tab: string, rowNumber: number, row: string[]): Promise<void>` — a
`spreadsheets.values.update` over `${tab}!A{rowNumber}` with the aligned row.
Add to both the `SheetsGateway` interface and the Google + memory gateways.

## 7. worklog-core additions

- `Worker` gains `teudatZeut: string` (parsed from `teudat_zeut`).
- `interface WorkEntry { id: string; rowNumber: number; phone: string; locked: boolean; values: Record<string,string>; hours: string }`
- `listWorkerEntries(gateway, phone): Promise<WorkEntry[]>` — read `WorkLogs`,
  `rowsToObjects` + index, filter by normalized phone, newest first.
- `getEntry(gateway, id): Promise<WorkEntry | null>`.
- `updateEntry(gateway, id, answers, worker, questions, tz, now): Promise<{ok:true} | {ok:false, errors|reason}>`
  — ownership + lock guard + validate + recompute + `updateRow`.
- `appendWorkLog` extended to include a generated `id` and empty `locked`.
- `findWorkerByToken`/`generateToken` become unused (kept or removed with the page).

## 8. Error handling

- Login mismatch → 401, generic message.
- Unauthenticated `/app*` → redirect `/login`; protected API → 401.
- Edit a locked / not-owned entry → 403 ("This entry is locked" / "Not found").
- Validation failure on submit/edit → 400 with per-field errors (inline).
- Sheets read/write failure → user-facing "couldn't save, try again"; logged server-side (never the teudat zeut).

## 9. Testing

- **worklog-core:** phone+teudat auth match/mismatch; `listWorkerEntries` (filter by
  phone, parse `id`/`locked`, order); `updateEntry` (valid edit, locked-refusal,
  wrong-owner refusal, validation error); `appendWorkLog` writes an `id`.
- **session lib:** `createSession`/`readSession` roundtrip; reject tampered value;
  reject wrong secret; reject malformed.
- **sheets-helper:** `updateRow` against the memory gateway (overwrites the right row).
- **web:** login route (match → cookie set; mismatch → 401); `/api/submit` now
  session-based (401 without cookie); `PATCH /api/entries/[id]` (locked → 403,
  not-owned → 403, valid → updates).
- **No new required env var.** `SESSION_SECRET` is optional (documented in `.env.local.example`); by default the signing key is derived from `GOOGLE_SERVICE_ACCOUNT_JSON`. `getSigningKey()` is unit-tested for both the env-set and derived paths.

## 10. Out of scope (this build) / future

- The polished FlowCat visual design + Russian localization.
- Multiple shifts per day, copy-to-next-day, period total report, «Сформировать табель».
- Deleting entries.
- Login rate-limiting / brute-force protection (flagged; low risk internally).
- Backfilling `id`s onto pre-existing `WorkLogs` rows.
- The admin UI (separate Plan B).
