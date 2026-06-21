# FlowCat Web Form — Design Spec

**Date:** 2026-06-21
**Status:** Approved design — ready for implementation plan
**Project:** `slavery-courage` monorepo (repo: `OneStromberg/slavery-courage`, deploys to Vercel)

## 1. Purpose

Replace the WhatsApp bot with a **web form** for logging hourly work. Each worker
gets a **unique URL** (a magic link). They open it on their phone, fill a form —
place, date (calendar), start/finish (time pickers) — and submit. Each submission
is appended to the Google Sheet, which remains the database. An **admin web area**
(for the friend running the company) manages workers + their links, places,
questions, and viewing/exporting the logs.

The flow's fields are **data-driven** from the same admin-editable `Questions` tab
the chat bot used — so the admin still controls the questions without code changes.

## 2. Key Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Channel | **Web form** (replaces WhatsApp/Telegram) | Internal tool for known employees; no Meta business verification, native calendar/time pickers, free hosting. |
| Hosting | **Next.js (App Router) on Vercel** | The natural Vercel stack; serverless Route Handlers for Sheets access; first-class GitHub auto-deploy. |
| Database | **Google Sheets** (unchanged) via the service account | Source of truth stays the sheet; no new DB. |
| Worker identity | **Magic-link token** per worker | Admin generates a random token stored in the sheet; URL `/w/<token>`; no login. Regenerate to revoke. Fine for trusted internal staff. |
| Form fields | **Rendered from the `Questions` tab** | Admin keeps configurability; each type maps to a native widget. |
| Admin auth | **NextAuth + Google**, gated by an **email allowlist** | Real per-person identity for the admin surface. |
| Admin scope | Workers + links, **view/export logs**, **manage places**, **edit questions** | The admin UI becomes the control panel; sheet stays the DB underneath. |
| WhatsApp bot | **Parked** (kept, not deployed) | Still builds/tests; revivable. Shared logic extracted so nothing is duplicated. |
| UI polish | **Clean & functional** — Tailwind + native pickers (worker, mobile-first); a tidy component lib (shadcn/ui) for admin tables | Looks good, ships fast, minimal deps. |

## 3. Architecture & Repo Layout

Everything that touches the Sheet runs **server-side only** (Route Handlers /
server components); the service account never reaches the browser. Vercel
functions are stateless — there is **no multi-step server session** (the form
holds its own state in the browser and submits once), so the in-memory-session
problem that constrained the chat bot does not exist here.

```
packages/
  sheets-helper/    Shared Sheets gateway. EXTENDED to accept inline credentials
                    (a parsed JSON object) in addition to a key-file path, so the
                    same gateway works locally (file) and on Vercel (env var).
  worklog-core/     NEW — channel-agnostic domain, MOVED out of whatsapp-bot:
                      data/      workers, places, worklogs, phone
                      questions/ load, types, validate
                      time/      clock, dates
                      submit/    submitWorklog(gateway, worker, questions, answers, now)
                                 — validates answers, computes hours, appends a row
  whatsapp-bot/     PARKED — now imports @scourage/worklog-core; still builds + tests.
  web/              NEW — Next.js App Router app deployed to Vercel:
                      app/w/[token]/        worker form (server component + client form)
                      app/admin/            admin dashboard (workers, logs, places, questions)
                      app/api/submit/       worker submission Route Handler
                      app/api/admin/*/      admin Route Handlers (guarded by session)
                      lib/auth.ts           NextAuth config (Google + email allowlist)
                      lib/sheets.ts         server-only gateway factory (inline creds)
                      lib/form-widgets.ts   Question.type -> form widget mapping (pure)
```

### `worklog-core` extraction
The modules currently under `whatsapp-bot/src/{data,questions,time}` move verbatim
into `worklog-core` (their tests move with them). A new `submitWorklog()` function
centralizes the write path (currently inline in the chat engine's `finalize`):
validate each answer by its question type, compute `hours` from `start`+`end` time
answers, append the `WorkLogs` row via the gateway. Both the web `/api/submit`
handler and the parked chat engine call it.

## 4. Data Model (one sheet change)

The `Workers` tab gains a **`token`** column — the per-worker magic-link secret.
Everything else is unchanged.

| Tab | Columns |
|---|---|
| **Workers** | `phone · name · greeting · places · active · token` |
| **Places** | `place_name · active` |
| **Questions** | `order · key · type · text · options · required` |
| **WorkLogs** | `logged_at · phone · name · <one column per question key> · hours` |

- **`token`**: a long URL-safe random string (≥ 16 bytes of entropy, crypto-random).
  Looked up by linear scan of `Workers` (small N). Regenerating overwrites it,
  invalidating the old link.

## 5. Worker Form Flow

```
GET /w/<token>
  └─ server loads worker by token
       ├─ not found / inactive       → "This link isn't valid. Ask your manager." page
       └─ found                      → load Questions config + worker's places →
                                        render the form (server component shell +
                                        client form), greeting from the worker row

Worker fills the form (mobile-first):
  worker_places / choice  → <select> dropdown
  date                    → native <input type="date"> (defaults to today, TZ-aware)
  time                    → native <input type="time">
  text / number           → <input>
  optional fields         → omittable

POST /api/submit  { token, answers }
  └─ server RE-loads the worker by token (never trusts the client)
     RE-loads Questions, validates EVERY answer server-side (worklog-core),
     recomputes hours, appends the WorkLog row
       ├─ validation error  → 400 with per-field messages (shown inline)
       ├─ sheets failure     → 503 "couldn't save, try again" (client retry)
       └─ success            → success screen: "Logged 8.5h ✅"
```

Server-side validation is mandatory — the client form is a convenience, not the
source of truth. `submitWorklog()` is the single authority for what gets written.

## 6. Admin UI (`/admin`)

Behind NextAuth Google login; only emails in `ADMIN_EMAILS` may load any admin
page **and** every admin Route Handler re-checks the session (not just the page).

- **Workers** — table; add / edit / deactivate; **Generate link · Copy · Regenerate**
  (regenerate writes a new `token`, revoking the old URL). The shown link is
  `https://<app-domain>/w/<token>`.
- **Work Logs** — read-only table from `WorkLogs`; filter by worker + date range;
  **Export CSV** (generated server-side).
- **Places** — add / edit / toggle active (writes the `Places` tab).
- **Questions** — reorder / retext / add / remove, set type (writes the `Questions`
  tab); validated with `validateQuestions` before save.

## 7. Auth & Secrets

- **Worker:** opaque `token` in the URL only — no login. Tokens are crypto-random;
  regenerate to revoke.
- **Admin:** NextAuth Google provider; authorize only `ADMIN_EMAILS`. Session
  checked in a shared `requireAdmin()` helper used by every admin Route Handler.
- **Sheets on Vercel:** no filesystem, so the service-account credentials are an
  **env var** (`GOOGLE_SERVICE_ACCOUNT_JSON`, the key file's JSON contents). The
  `sheets-helper` gateway is extended to accept inline credentials.
- **Env vars (Vercel):** `GOOGLE_SERVICE_ACCOUNT_JSON`, `SHEETS_SPREADSHEET_ID`,
  `COMPANY_TIMEZONE`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET`, `ADMIN_EMAILS`. Mirrored locally in
  `packages/web/.env.local` (gitignored).

## 8. Error Handling & Testing

### Error handling
- Invalid/expired token, inactive worker → friendly page (no internal details).
- Submit validation → per-field inline errors; the row is not written.
- Sheets read/write failure → user-facing retry message; error logged server-side.
- Admin unauthorized → redirect to sign-in; admin API → 401/403.

### Testing
- **Reuse** the existing `worklog-core` unit tests (they move with the code).
- **New unit tests:** token lookup; `submitWorklog()` server-side validation +
  hours; the `Question.type → widget` mapper (pure); CSV export (pure); the
  inline-credentials gateway path.
- **Light E2E (optional v1):** one Playwright happy-path — open `/w/<token>`,
  fill, submit, assert the success screen (Sheets mocked or a test sheet).

## 9. Deployment

- Vercel project imported from `OneStromberg/slavery-courage`; **Root Directory =
  `packages/web`**; pnpm workspace install. Auto-deploy on push to `main`.
- Google OAuth: add the Vercel domain to the OAuth client's authorized redirect
  URIs (`https://<app-domain>/api/auth/callback/google`).
- The spreadsheet is already shared with the service account.
- Vercel domain (default `*.vercel.app`) is fine for v1; custom domain later.

## 10. Out of Scope (v1) / Future

- Custom domain, branded/polished design pass.
- Per-worker login (OTP/SMS) — magic-link tokens are the v1 identity.
- Editing/deleting a previously submitted log from the worker form.
- Conditional/branching questions; per-worker different question sets.
- Reviving/deploying the WhatsApp channel.
