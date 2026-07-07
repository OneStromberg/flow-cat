# Firestore Migration — Design

**Date:** 2026-07-07
**Goal:** Move FlowCat's storage from Google Sheets to Firestore with **zero data-layer/app/test changes**, via an adapter behind the existing `SheetsGateway` interface. Full cutover; the Sheet stays as a backup. Decided: **adapter**, **full cutover**.

## Why this is small
The entire app talks to storage through ONE interface (`SheetsGateway`: `readTab`, `writeHeaderRow`, `appendRow`, `updateRow`). `createGoogleGateway` implements it over Sheets; `createMemoryGateway` implements it for the 129 tests. So we add a third implementation — `createFirestoreGateway` — and swap one line. Nothing else changes.

**Bonus:** Firestore is strongly consistent with no 60-reads/min quota, so this also removes the *root cause* of the Sheets-quota bugs (#1 false-save, #2 stale-after-write, #3 quota-failed seeds).

## Firestore data model (preserves the row/index contract)
This app is **append-only + soft-delete** — rows are never removed or reordered — so row positions are stable and the 1-based `updateRow(n)` maps deterministically to a fixed doc.

- Root collection `sheets` (env `FIRESTORE_ROOT_COLLECTION`, default `sheets`).
- One **tab document** per tab: `sheets/{tab}` holding meta `{ count: number }` (total rows incl. header).
- One **row document** per row in subcollection `sheets/{tab}/rows/{docId}`, where `docId = String(_row).padStart(9,'0')` and the doc is `{ _row: number, _cells: string[] }`. `_row` is 1-based (row 1 = header), matching the Sheets contract.

**Operations:**
- `readTab(tab)` → query `sheets/{tab}/rows` `orderBy('_row')` → return `d._cells[]`. Empty/missing → `[]` (matches Google gateway).
- `writeHeaderRow(tab, headers)` → set `rows/{id(1)}` = `{_row:1, _cells:headers}`; ensure `sheets/{tab}.count ≥ 1` (transaction).
- `appendRow(tab, row)` → **transaction**: read `count` (default 0), `newRow = count+1`, set `rows/{id(newRow)}`, set `count = newRow`. (Transactional counter = safe concurrent appends, no `_row` collision — the thing Sheets couldn't do.)
- `updateRow(tab, n, row)` → set `rows/{id(n)}` = `{_row:n, _cells:row}` (direct, last-write-wins — matches Sheets).

Per-row docs (not one-doc-per-tab) avoid Firestore's 1 MB doc limit and write contention.

## Backend selection + rollback
`getGateway()` (`packages/web/lib/sheets.ts`) reads env `STORAGE_BACKEND` (`firestore` default post-cutover | `sheets`) and builds the corresponding inner gateway, still wrapped in the existing `createTtlCachingGateway`. Firestore config comes from the SAME `GOOGLE_SERVICE_ACCOUNT_JSON` (its `project_id` + `client_email`/`private_key`). **Rollback = set `STORAGE_BACKEND=sheets` + redeploy** (the Sheet is untouched).

*(The 10s cross-request TTL cache can later be dropped now that Firestore is consistent — that would fully fix #2's residual staleness. Out of scope for the migration; keep behavior identical for now.)*

## SDK
`@google-cloud/firestore` (standalone, lighter than firebase-admin), server-only (added to `sheets-helper`, used only via the server-only `lib/sheets.ts`). Init: `new Firestore({ projectId, credentials: { client_email, private_key } })`.

## Migration (I build; USER runs)
A one-time script reads every tab from the Sheet and writes exact rows to Firestore, preserving positions + the counter, by reusing the gateway: for each of the 13 tabs — `Workers, Places, Cities, ShiftTemplates, RecurringAssignments, ShiftInstances, ShiftAssignments, Attendance, Alerts, Adjustments, Leave, Questions, WorkLogs` — `rows = sheetsGw.readTab(tab)`; if non-empty, `fsGw.writeHeaderRow(tab, rows[0])` then `fsGw.appendRow(tab, rows[i])` for i≥1 (preserves order, sets the counter correctly). Idempotency: re-running overwrites by deterministic `_row` id (safe to re-run before cutover).

### User's one-time setup (I can't touch the live GCP project)
1. Enable **Firestore (Native mode)** on the GCP project.
2. Grant the service account **`roles/datastore.user`**.
3. Run the migration script locally with `GOOGLE_SERVICE_ACCOUNT_JSON` + `SHEETS_SPREADSHEET_ID` set.
4. Set Vercel env `STORAGE_BACKEND=firestore` (+ `FIRESTORE_ROOT_COLLECTION` if not default).
5. Deploy. Verify. (Rollback: `STORAGE_BACKEND=sheets`.)

## Testing
`createFirestoreGateway` logic (ordering, transactional counter, `updateRow`-by-id, missing-tab → `[]`) is unit-tested against a **minimal in-memory Firestore fake** implementing only the methods the gateway uses (`collection/doc/collection/orderBy/get`, `doc.set`, `runTransaction` with `tx.get/tx.set`) — deterministic, no emulator/infra needed. The 129 existing tests (memory gateway) are unaffected. web: typecheck + build.
