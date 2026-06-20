# slavery-courage

WhatsApp work-log bot + Google Sheets backend (pnpm monorepo).

## Packages
- `packages/sheets-helper` — Google Sheets access library (service-account auth, generic tab read/append).
- `packages/whatsapp-bot` — the bot (data-driven conversation engine, console + Cloud API transports).

## Quick start (local, no Meta needed)
1. `pnpm install`
2. Create a Google service account, enable the Sheets API, download the key JSON.
3. Create a test spreadsheet, share it with the service-account email (Editor).
4. Add tabs `Workers`, `Places`, `Questions`, `WorkLogs` (see `docs/default-questions-seed.md`).
5. `cp .env.example .env` and fill `SHEETS_SPREADSHEET_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `COMPANY_TIMEZONE`, `LOCAL_WORKER_PHONE` (must match a Workers row).
6. `pnpm --filter @scourage/whatsapp-bot dev:local` — play the conversation in your terminal; rows appear in the test Sheet.

## Tests
`pnpm -r test`

## Going live (later)
Set `WHATSAPP_TRANSPORT=cloud`, fill the Meta vars in `.env`, run `pnpm --filter @scourage/whatsapp-bot dev`, expose `:3000` via an HTTPS tunnel (ngrok), and point the Meta webhook at `<tunnel>/webhook`.
