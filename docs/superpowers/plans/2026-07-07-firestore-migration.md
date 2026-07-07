# Firestore Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Adapter migration to Firestore (spec: `docs/superpowers/specs/2026-07-07-firestore-migration-design.md`). Zero data-layer/test changes; swap the storage backend behind `SheetsGateway`.

## Global Constraints
- pnpm monorepo. sheets-helper is ESM `.ts`; tests `pnpm --filter @scourage/sheets-helper test`. web extensionless; `pnpm --filter @scourage/web typecheck && build`. worklog-core tests must stay green (`pnpm --filter @scourage/worklog-core test`, 129) — they use the memory gateway and MUST NOT be touched.
- Firestore = strong consistency, no per-minute quota. Model: `sheets/{tab}` (meta `{count}`) + `sheets/{tab}/rows/{padded _row}` = `{_row, _cells}`. Append-only + soft-delete ⇒ stable `_row`. Commit author = OneStromberg; LOCAL commits. ponytail.

---

### Task 1: `createFirestoreGateway` (sheets-helper)
**Files:** add `@google-cloud/firestore` to `packages/sheets-helper/package.json`; create `packages/sheets-helper/src/firestore-gateway.ts` + `firestore-gateway.test.ts`; export from `src/index.ts`.

**Produces:** `createFirestoreGateway(opts: { projectId: string; credentials: { client_email: string; private_key: string }; rootCollection?: string; firestore?: FirestoreLike }): SheetsGateway`. (`firestore?` injectable for tests; default constructs `new Firestore({ projectId, credentials })`.)

- [ ] **Step 1:** `pnpm --filter @scourage/sheets-helper add @google-cloud/firestore` (adds the dep).
- [ ] **Step 2: Failing test** `firestore-gateway.test.ts` — build a **minimal in-memory Firestore fake** implementing only what the gateway uses, then assert the gateway behaves like the memory gateway. The fake must support: `collection(name)` → `{ doc(id) }` and `{ orderBy(field) → { get() } }`; `doc(id)` → `{ collection(name), set(data), get() }`; `runTransaction(fn)` giving `{ get(ref), set(ref, data) }`. Store docs in a `Map<path, data>`. Tests:
```ts
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { createFirestoreGateway } from './firestore-gateway.ts';
import { makeFakeFirestore } from './firestore-fake-for-test.ts'; // or inline in the test file

test('missing tab reads empty', async () => {
  const g = createFirestoreGateway({ projectId:'p', credentials:{client_email:'x',private_key:'y'}, firestore: makeFakeFirestore() });
  assert.deepEqual(await g.readTab('Workers'), []);
});
test('writeHeaderRow + appendRow + readTab preserves order; updateRow overwrites by 1-based row', async () => {
  const g = createFirestoreGateway({ projectId:'p', credentials:{client_email:'x',private_key:'y'}, firestore: makeFakeFirestore() });
  await g.writeHeaderRow('Workers', ['phone','name']);
  await g.appendRow('Workers', ['p1','Ann']);
  await g.appendRow('Workers', ['p2','Bob']);
  assert.deepEqual(await g.readTab('Workers'), [['phone','name'],['p1','Ann'],['p2','Bob']]);
  await g.updateRow('Workers', 2, ['p1','Annie']); // row 2 = first data row
  assert.deepEqual((await g.readTab('Workers'))[1], ['p1','Annie']);
});
test('concurrent-ish appends do not collide on _row', async () => {
  const g = createFirestoreGateway({ projectId:'p', credentials:{client_email:'x',private_key:'y'}, firestore: makeFakeFirestore() });
  await g.writeHeaderRow('X', ['h']);
  await Promise.all([g.appendRow('X', ['a']), g.appendRow('X', ['b']), g.appendRow('X', ['c'])]);
  const rows = await g.readTab('X');
  assert.equal(rows.length, 4); // header + 3, distinct _row values
});
```
(The fake's `runTransaction` should serialize to model Firestore's transactional counter; keep it simple — an async lock or await-in-order is fine for the test.)
- [ ] **Step 3: Run — fail.**
- [ ] **Step 4: Implement `firestore-gateway.ts`:**
  - `import { Firestore } from '@google-cloud/firestore';` Define a light `FirestoreLike` type covering the methods used (or `any` for the injected fake, real `Firestore` by default).
  - `const root = opts.rootCollection ?? 'sheets'; const db = opts.firestore ?? new Firestore({ projectId: opts.projectId, credentials: opts.credentials });`
  - `const id = (n: number) => String(n).padStart(9, '0');`
  - `rowsRef(tab) = db.collection(root).doc(tab).collection('rows'); tabRef(tab) = db.collection(root).doc(tab);`
  - `readTab(tab)`: `const snap = await rowsRef(tab).orderBy('_row').get(); return snap.docs.map(d => d.data()._cells as string[]);` (empty → []).
  - `writeHeaderRow(tab, headers)`: `await rowsRef(tab).doc(id(1)).set({ _row: 1, _cells: headers });` then in a transaction bump count to ≥1: `await db.runTransaction(async (tx) => { const t = await tx.get(tabRef(tab)); const c = (t.data()?.count as number) ?? 0; tx.set(tabRef(tab), { count: Math.max(c, 1) }, { merge: true }); });`
  - `appendRow(tab, row)`: `await db.runTransaction(async (tx) => { const t = await tx.get(tabRef(tab)); const c = (t.data()?.count as number) ?? 0; const n = c + 1; tx.set(rowsRef(tab).doc(id(n)), { _row: n, _cells: row }); tx.set(tabRef(tab), { count: n }, { merge: true }); });`
  - `updateRow(tab, n, row)`: `await rowsRef(tab).doc(id(n)).set({ _row: n, _cells: row });`
  - Note: Firestore transactions require all reads before writes — the code above reads `tabRef` then writes; OK. Guard `_cells` is always an array of strings.
- [ ] **Step 5: Run — pass; typecheck** (`pnpm --filter @scourage/sheets-helper exec tsc --noEmit`).
- [ ] **Step 6: Export** `createFirestoreGateway` from `src/index.ts`.
- [ ] **Step 7:** Confirm `pnpm --filter @scourage/worklog-core test` still 129 green (unaffected).
- [ ] **Step 8: Commit.** `git commit -m "feat(sheets-helper): createFirestoreGateway (SheetsGateway over Firestore)"`

---

### Task 2: backend selection in `getGateway` (web)
**Files:** `packages/web/lib/sheets.ts`.

- [ ] **Step 1:** Read the file. `getGateway()` currently builds `createTtlCachingGateway(createGoogleGateway({ credentials, spreadsheetId }), TTL)`.
- [ ] **Step 2:** Change `getGateway()` to select the inner gateway by `process.env.STORAGE_BACKEND`:
```ts
const backend = (process.env.STORAGE_BACKEND ?? 'firestore').toLowerCase();
const creds = parseServiceAccountJson(json);
let inner;
if (backend === 'sheets') {
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('Missing SHEETS_SPREADSHEET_ID');
  inner = createGoogleGateway({ credentials: creds, spreadsheetId });
} else {
  const projectId = (creds as any).project_id as string | undefined;
  if (!projectId) throw new Error('SA JSON missing project_id (needed for Firestore)');
  inner = createFirestoreGateway({
    projectId,
    credentials: { client_email: creds.client_email, private_key: creds.private_key },
    rootCollection: process.env.FIRESTORE_ROOT_COLLECTION,
  });
}
cached = createTtlCachingGateway(inner, READ_CACHE_TTL_MS);
```
Import `createFirestoreGateway` from `@scourage/sheets-helper`. Keep the existing `getRequestGateway`/`COMPANY_TZ` exports unchanged. (Default is `firestore` so the deployed app uses Firestore post-migration; `STORAGE_BACKEND=sheets` rolls back.)
- [ ] **Step 3:** `pnpm --filter @scourage/web typecheck && build` → pass. (Build must not require live Firestore — the gateway is constructed lazily inside `getGateway`, only called at request time.)
- [ ] **Step 4: Commit.** `git commit -m "feat(web): select storage backend via STORAGE_BACKEND (firestore default)"`

---

### Task 3: migration script + usage doc
**Files:** create `scripts/migrate-sheets-to-firestore.mjs` (or `.ts` runnable via `tsx`); create `scripts/README-firestore-migration.md`.

- [ ] **Step 1:** Script: reads env `GOOGLE_SERVICE_ACCOUNT_JSON` + `SHEETS_SPREADSHEET_ID` (+ optional `FIRESTORE_ROOT_COLLECTION`). Build `sheetsGw = createGoogleGateway({ credentials, spreadsheetId })` and `fsGw = createFirestoreGateway({ projectId: creds.project_id, credentials: {client_email, private_key}, rootCollection })` (import from `@scourage/sheets-helper`). For each tab in `TABS = ['Workers','Places','Cities','ShiftTemplates','RecurringAssignments','ShiftInstances','ShiftAssignments','Attendance','Alerts','Adjustments','Leave','Questions','WorkLogs']`:
```js
const rows = await sheetsGw.readTab(tab);
if (!rows.length) { console.log(`${tab}: empty, skipped`); continue; }
await fsGw.writeHeaderRow(tab, rows[0]);
for (let i = 1; i < rows.length; i++) await fsGw.appendRow(tab, rows[i]);
console.log(`${tab}: migrated ${rows.length - 1} data rows`);
```
Print a final summary. Wrap each tab in try/catch so one failure doesn't abort the rest (log + continue). Exit non-zero if any tab failed.
- [ ] **Step 2:** README: the exact user runbook — (1) enable Firestore Native mode; (2) grant SA `roles/datastore.user`; (3) `GOOGLE_SERVICE_ACCOUNT_JSON=... SHEETS_SPREADSHEET_ID=... pnpm tsx scripts/migrate-sheets-to-firestore.mjs` (or `node` if plain mjs with a bundled import path — pick what runs cleanly in this repo; verify the import of `@scourage/sheets-helper` resolves from the script, e.g. run it from repo root with the workspace resolution, or import the built package); (4) set Vercel `STORAGE_BACKEND=firestore`; (5) redeploy + verify; rollback = `STORAGE_BACKEND=sheets`. Note the Sheet is left untouched as backup, and the script is safe to re-run (overwrites by deterministic `_row`).
- [ ] **Step 3:** Verify the script at least loads/typechecks (`node --check` for .mjs, or `pnpm tsx --eval` import smoke) WITHOUT hitting live services — do NOT run the real migration (no live creds here). Confirm imports resolve.
- [ ] **Step 4: Commit.** `git commit -m "chore: sheets→firestore migration script + runbook"`

---

## Self-Review Notes
- **Coverage:** adapter → T1 · backend switch + rollback → T2 · data migration → T3 (user-run).
- **Type consistency:** `createFirestoreGateway` (T1) consumed by T2 + T3.
- **Ordering:** T1 → T2/T3. worklog-core's 129 tests untouched (memory gateway).
- **Safety:** full cutover but the Sheet is untouched; `STORAGE_BACKEND=sheets` is a one-env rollback. Firestore's consistency also removes the Sheets-quota bug class.
- **Not automated here:** enabling Firestore, granting IAM, running the migration, setting env — all user-run (no live GCP access from this session).
