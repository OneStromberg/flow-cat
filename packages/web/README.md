# FlowCat Web

Next.js worker form + (Plan B) admin, on Vercel. Google Sheet is the database.

## Local dev
1. `pnpm install`
2. `cp .env.local.example .env.local` and fill:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — the service-account key file's JSON, as a single line.
   - `SHEETS_SPREADSHEET_ID`, `COMPANY_TIMEZONE`.
3. `pnpm --filter @scourage/web dev` → open `http://localhost:3001` or `http://localhost:3001/app`.

## Deploy (Vercel)
- Import `OneStromberg/flow-cat`; set **Root Directory = `packages/web`**.
- Build command / install are auto-detected (Next.js + pnpm workspace).
- Env vars (Production + Preview): `GOOGLE_SERVICE_ACCOUNT_JSON`, `SHEETS_SPREADSHEET_ID`, `COMPANY_TIMEZONE`.
- The spreadsheet must be shared with the service-account email (Editor).

## Worker app
- `/login` — workers log in with **phone + teudat zeut** (matched against the `Workers` tab's `phone` + `teudat_zeut` columns).
- `/app` — enter a new shift, and review/edit your own hours. Entries with `locked = yes` in the `WorkLogs` tab are read-only.
- Session is a browser-session cookie (clears on close). The signing key is derived from `GOOGLE_SERVICE_ACCOUNT_JSON` — **no extra env var needed**.

### Sheet columns this expects
- **Workers:** `phone · name · greeting · places · active · teudat_zeut`
- **WorkLogs:** `logged_at · phone · name · id · <question keys> · hours · locked` (the bot/app add `id`/`locked` automatically on new entries; admins set `locked = yes` to freeze a row).

## Admin area
A worker with `admin = yes` in the Workers tab logs in normally and lands on `/admin`:
- **Workers list** with multi-field filtering (transport, Hebrew level, pay, schedule, city, places, age range, active, name/phone search) — AND across fields, OR within each.
- **Add worker** (`/admin/add`) — phone, teudat zeut, name, allowed places, city, age, transportation, Hebrew level, pay eligibility (+ amount), schedule. Duplicate phones are rejected.

Set `admin = yes` on a worker row to promote them. New Workers columns: `admin · city · age · transportation · hebrew_level · pay_type · pay_amount · schedule`.
