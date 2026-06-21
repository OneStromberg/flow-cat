# FlowCat Web

Next.js worker form + (Plan B) admin, on Vercel. Google Sheet is the database.

## Local dev
1. `pnpm install`
2. `cp .env.local.example .env.local` and fill:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — the service-account key file's JSON, as a single line.
   - `SHEETS_SPREADSHEET_ID`, `COMPANY_TIMEZONE`.
3. Ensure a `Workers` row has a `token` (generate one with the add-worker script).
4. `pnpm --filter @scourage/web dev` → open `http://localhost:3001/w/<token>`.

## Deploy (Vercel)
- Import `OneStromberg/flow-cat`; set **Root Directory = `packages/web`**.
- Build command / install are auto-detected (Next.js + pnpm workspace).
- Env vars (Production + Preview): `GOOGLE_SERVICE_ACCOUNT_JSON`, `SHEETS_SPREADSHEET_ID`, `COMPANY_TIMEZONE`.
- The spreadsheet must be shared with the service-account email (Editor).
- Worker links are `https://<app-domain>/w/<token>`.
