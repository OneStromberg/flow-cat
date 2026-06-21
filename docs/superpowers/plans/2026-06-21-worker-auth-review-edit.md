# FlowCat Worker App — Auth + Review + Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-time `/w/<token>` link with a shared, authenticated worker app (login with phone + teudat zeut → session cookie), where a worker can enter, review, and edit (unless locked) their own work entries.

**Architecture:** `sheets-helper` gains row-update; `worklog-core` gains teudat-zeut auth, entry id/locked, and list/get/update entry functions plus pure session-signing crypto; the Next.js `web` app gets a `/login` page, a session helper deriving its signing key from the existing service-account secret, an authed `/app` (entry form + "My hours" review), and `/app/edit/[id]`. Google Sheets stays the database.

**Tech Stack:** Next.js 15 App Router + React 19, TypeScript, `googleapis`, `node:crypto`, Node built-in test runner via `tsx`. Deployed on Vercel.

## Global Constraints

- **Node ≥ 22**, ESM everywhere. `worklog-core`/`sheets-helper` use explicit `.ts` import extensions; the `web` package uses bare specifiers for workspace packages and Next resolution within `app/`/`lib`.
- **pnpm only.** Packages: `@scourage/sheets-helper`, `@scourage/worklog-core`, `@scourage/web`.
- **No new required env var.** The session signing key is `process.env.SESSION_SECRET` if set, else derived as `HMAC-SHA256("flowcat-session", <service-account private_key>)` from `GOOGLE_SERVICE_ACCOUNT_JSON`.
- **Teudat zeut is PII:** only read in the login request body, only compared server-side. **Never logged, never put in the cookie, never sent to the client.**
- **Session cookie** `fc_session`: `HttpOnly; Secure; SameSite=Lax; Path=/`, **no `Max-Age`/`Expires`** (clears on browser close). Holds only the worker's phone, HMAC-signed.
- **Server-side only** for Sheets + session verification (Route Handlers / server components). The client form never sees identity beyond what the session grants.
- Routes/pages that use `googleapis` or `node:crypto` declare `export const runtime = 'nodejs'`.
- **Do not run `git push`** — local commits only.
- **ponytail:** build exactly what each task's brief specifies, simplest first, no extra deps or abstractions.

---

### Task 1: sheets-helper — `updateRow`

**Files:**
- Modify: `packages/sheets-helper/src/gateway.ts` (interface)
- Modify: `packages/sheets-helper/src/memory-gateway.ts`
- Modify: `packages/sheets-helper/src/google-gateway.ts`
- Test: `packages/sheets-helper/src/memory-gateway.test.ts` (add a case)

**Interfaces:**
- Produces: `SheetsGateway.updateRow(tab: string, rowNumber: number, row: string[]): Promise<void>` — overwrites the 1-based `rowNumber` (row 1 = header) with `row`.

- [ ] **Step 1: Add to the interface — `packages/sheets-helper/src/gateway.ts`**

Add to `SheetsGateway`:
```ts
  /** Overwrites the given 1-based row number (row 1 = header) with `row`. */
  updateRow(tab: string, rowNumber: number, row: string[]): Promise<void>;
```

- [ ] **Step 2: Write the failing test — append to `packages/sheets-helper/src/memory-gateway.test.ts`**

```ts
test('memory gateway updates a specific row', async () => {
  const g = createMemoryGateway({ WorkLogs: [['id', 'name'], ['a', 'John'], ['b', 'Maria']] });
  await g.updateRow('WorkLogs', 3, ['b', 'Maria Updated']);
  assert.deepEqual(g.dump().WorkLogs, [['id', 'name'], ['a', 'John'], ['b', 'Maria Updated']]);
});
```

- [ ] **Step 3: Run — verify fail**

Run: `pnpm --filter @scourage/sheets-helper test`
Expected: FAIL — `updateRow` is not a function.

- [ ] **Step 4: Implement in `packages/sheets-helper/src/memory-gateway.ts`**

Add this method inside the returned object (next to `appendRow`):
```ts
    async updateRow(tab, rowNumber, row) {
      const t = (tabs[tab] ??= []);
      t[rowNumber - 1] = [...row];
    },
```

- [ ] **Step 5: Implement in `packages/sheets-helper/src/google-gateway.ts`**

Add this method inside the returned object (next to `appendRow`):
```ts
    async updateRow(tab, rowNumber, row) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
    },
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @scourage/sheets-helper test && pnpm --filter @scourage/sheets-helper typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/sheets-helper
git commit -m "feat(sheets-helper): updateRow for editing a specific row"
```

---

### Task 2: worklog-core — teudat zeut, auth, entry id/locked

**Files:**
- Modify: `packages/worklog-core/src/data/workers.ts` (add `teudatZeut`, `authenticateWorker`)
- Modify: `packages/worklog-core/src/data/worklogs.ts` (conditional `id`/`locked` columns)
- Modify: `packages/worklog-core/src/submit/submit-worklog.ts` (generate id + locked)
- Modify: `packages/worklog-core/src/index.ts`
- Test: `packages/worklog-core/src/data/workers.test.ts` (add cases)
- Test: `packages/worklog-core/src/submit/submit-worklog.test.ts` (assert id/locked)

**Interfaces:**
- Produces:
  - `Worker` gains `teudatZeut: string`.
  - `authenticateWorker(gateway, phone: string, teudatZeut: string): Promise<Worker | null>` — returns the active worker iff phone matches a row AND `teudat_zeut` matches (trimmed, exact); else null.
  - `appendWorkLog` now writes an `id` column (after `name`) and a `locked` column (end) **when the record carries those keys**. The bot path (no id/locked in record) is unchanged.
  - `submitWorklog` now generates `record.id` and sets `record.locked = ''` before appending.

- [ ] **Step 1: Write the failing test — append to `packages/worklog-core/src/data/workers.test.ts`**

```ts
import { authenticateWorker } from './workers.ts';

test('parses teudat_zeut and authenticates by phone + teudat', async () => {
  const g = createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active', 'teudat_zeut'],
      ['15551230000', 'John', '', 'Warehouse', 'yes', '123456782'],
    ],
  });
  const ok = await authenticateWorker(g, '+1 555-123-0000', '123456782');
  assert.equal(ok?.name, 'John');
  assert.equal(ok?.teudatZeut, '123456782');
  assert.equal(await authenticateWorker(g, '15551230000', '999999999'), null); // wrong teudat
  assert.equal(await authenticateWorker(g, '10000000000', '123456782'), null); // wrong phone
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: FAIL — `authenticateWorker` not exported / `teudatZeut` undefined.

- [ ] **Step 3: Modify `packages/worklog-core/src/data/workers.ts`**

Add `teudatZeut` to the interface and the `buildWorker` return, and add `authenticateWorker`. The interface becomes:
```ts
export interface Worker {
  phone: string;
  name: string;
  greeting: string;
  places: string[];
  active: boolean;
  token?: string;
  teudatZeut: string;
}
```
In `buildWorker`, add to the returned object:
```ts
    teudatZeut: (row.teudat_zeut ?? '').trim(),
```
At the end of the file add:
```ts
export async function authenticateWorker(
  gateway: SheetsGateway,
  phone: string,
  teudatZeut: string,
): Promise<Worker | null> {
  const worker = await findWorker(gateway, phone);
  if (!worker || !worker.active) return null;
  if (worker.teudatZeut === '' || worker.teudatZeut !== teudatZeut.trim()) return null;
  return worker;
}
```
(Any existing test that builds a literal `Worker` object now needs `teudatZeut: ''` — the `worker_places`/`choice` test literals in `whatsapp-bot` and the `web` form-widgets test. Add `teudatZeut: ''` to each literal `Worker` the typechecker flags.)

- [ ] **Step 4: Modify `packages/worklog-core/src/data/worklogs.ts` (conditional id/locked)**

Replace the `desired` construction at the top of `appendWorkLog`:
```ts
  const desired = ['logged_at', 'phone', 'name'];
  if (record.id !== undefined) desired.push('id');
  desired.push(...questionKeys);
  if (record.hours !== undefined && record.hours !== '') desired.push('hours');
  if (record.locked !== undefined) desired.push('locked');
```
Leave the rest of `appendWorkLog` unchanged.

- [ ] **Step 5: Modify `packages/worklog-core/src/submit/submit-worklog.ts` (generate id + locked)**

Add the import and set the two fields before appending:
```ts
import { generateToken } from '../data/tokens.ts';
```
Inside `submitWorklog`, after `const { record, keys } = buildWorklogRecord(...)`:
```ts
  record.id = generateToken();
  record.locked = '';
  await appendWorkLog(gateway, record, keys);
```
(Replace the existing `await appendWorkLog(...)` line.)

- [ ] **Step 6: Update `packages/worklog-core/src/submit/submit-worklog.test.ts`**

The "valid submit appends a WorkLog row with hours" test seeds `WorkLogs` with header `['logged_at','phone','name','place','start','end','hours']` and asserts `slice(1)`. With id/locked now added, the appended row gets `id` (a generated value) inserted after `name` and `locked` at the end. Change that test to assert by header-mapped object instead of positional slice:
```ts
test('valid submit appends a WorkLog row with id, hours, and empty locked', async () => {
  const g = createMemoryGateway({ WorkLogs: [['logged_at', 'phone', 'name', 'place', 'start', 'end', 'hours']] });
  const r = await submitWorklog(g, worker, questions, { place: 'Warehouse', start: '08:00', end: '16:30' }, 'Asia/Jerusalem', now);
  assert.deepEqual(r, { ok: true, hours: '8.5' });
  const log = g.dump().WorkLogs;
  const header = log[0];
  const row = log[1];
  const get = (k: string) => row[header.indexOf(k)];
  assert.equal(get('phone'), '555');
  assert.equal(get('place'), 'Warehouse');
  assert.equal(get('hours'), '8.5');
  assert.equal(get('locked'), '');
  assert.match(get('id'), /.+/); // id was generated and written
  assert.ok(header.includes('id') && header.includes('locked'));
});
```
Leave the "invalid submit" test as-is (it still writes nothing).

- [ ] **Step 7: Update `packages/worklog-core/src/index.ts`** — add:

```ts
export { authenticateWorker } from './data/workers.ts';
```

- [ ] **Step 8: Run everything**

Run:
```bash
pnpm --filter @scourage/worklog-core test && pnpm --filter @scourage/worklog-core typecheck
pnpm --filter @scourage/whatsapp-bot test && pnpm --filter @scourage/whatsapp-bot typecheck
```
Expected: all PASS. (Fix any `whatsapp-bot` literal `Worker` that needs `teudatZeut: ''` — render-question/parse-answer tests.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(worklog-core): teudat-zeut auth + entry id/locked columns"
```

---

### Task 3: worklog-core — list / get / update entries

**Files:**
- Create: `packages/worklog-core/src/entries/entries.ts`
- Test: `packages/worklog-core/src/entries/entries.test.ts`
- Modify: `packages/worklog-core/src/index.ts`

**Interfaces:**
- Consumes: `SheetsGateway`, `rowsToObjects`, `objectToRow`, `normalizePhone`, `Worker`, `Question`, `validateAnswers`, `buildWorklogRecord`.
- Produces:
  - `interface WorkEntry { id: string; rowNumber: number; phone: string; locked: boolean; hours: string; values: Record<string, string>; }`
  - `listWorkerEntries(gateway, phone: string): Promise<WorkEntry[]>` — this worker's rows, newest first.
  - `getEntry(gateway, id: string): Promise<WorkEntry | null>`.
  - `updateEntry(gateway, id, answers, worker, questions, tz, now): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'forbidden' | 'locked' } | { ok: false; errors: Record<string, string> }>`.

- [ ] **Step 1: Write the failing test — `packages/worklog-core/src/entries/entries.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { listWorkerEntries, getEntry, updateEntry } from './entries.ts';
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';

const HEADER = ['logged_at', 'phone', 'name', 'id', 'place', 'date', 'start', 'end', 'hours', 'locked'];
const seed = () => ({
  WorkLogs: [
    HEADER,
    ['T1', '555', 'John', 'e1', 'Warehouse', '2026-06-19', '08:00', '16:00', '8', ''],
    ['T2', '555', 'John', 'e2', 'Office HQ', '2026-06-20', '09:00', '17:30', '8.5', 'yes'],
    ['T3', '999', 'Maria', 'e3', 'Warehouse', '2026-06-20', '08:00', '12:00', '4', ''],
  ],
});
const worker: Worker = { phone: '555', name: 'John', greeting: '', places: ['Warehouse', 'Office HQ'], active: true, teudatZeut: '1' };
const questions: Question[] = [
  { order: 1, key: 'place', type: 'worker_places', text: 'Where?', options: [], required: true },
  { order: 2, key: 'date', type: 'date', text: 'Day?', options: [], required: true },
  { order: 3, key: 'start', type: 'time', text: 'Start?', options: [], required: true },
  { order: 4, key: 'end', type: 'time', text: 'End?', options: [], required: true },
];
const now = new Date('2026-06-21T09:00:00Z');

test('lists only this worker entries, newest first', async () => {
  const g = createMemoryGateway(seed());
  const entries = await listWorkerEntries(g, '+1 555');
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((e) => e.id), ['e2', 'e1']); // newest (later row) first
  assert.equal(entries[0].locked, true);
});

test('getEntry finds by id', async () => {
  const g = createMemoryGateway(seed());
  assert.equal((await getEntry(g, 'e1'))?.values.place, 'Warehouse');
  assert.equal(await getEntry(g, 'nope'), null);
});

test('updateEntry edits an unlocked owned entry and recomputes hours', async () => {
  const g = createMemoryGateway(seed());
  const r = await updateEntry(g, 'e1', { place: 'Office HQ', date: '2026-06-19', start: '08:00', end: '12:00' }, worker, questions, 'Asia/Jerusalem', now);
  assert.deepEqual(r, { ok: true });
  const e = await getEntry(g, 'e1');
  assert.equal(e?.values.place, 'Office HQ');
  assert.equal(e?.values.hours, '4');
});

test('updateEntry refuses locked, wrong-owner, and not-found', async () => {
  const g = createMemoryGateway(seed());
  assert.deepEqual(await updateEntry(g, 'e2', { place: 'Warehouse', date: '2026-06-20', start: '09:00', end: '10:00' }, worker, questions, 'Asia/Jerusalem', now), { ok: false, reason: 'locked' });
  assert.deepEqual(await updateEntry(g, 'e3', { place: 'Warehouse', date: '2026-06-20', start: '08:00', end: '09:00' }, worker, questions, 'Asia/Jerusalem', now), { ok: false, reason: 'forbidden' });
  assert.deepEqual(await updateEntry(g, 'zzz', {}, worker, questions, 'Asia/Jerusalem', now), { ok: false, reason: 'not_found' });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: FAIL — cannot find `./entries.ts`.

- [ ] **Step 3: Implement `packages/worklog-core/src/entries/entries.ts`**

```ts
import { objectToRow, type SheetsGateway } from '@scourage/sheets-helper';
import { normalizePhone } from '../data/phone.ts';
import type { Worker } from '../data/workers.ts';
import type { Question } from '../questions/types.ts';
import { validateAnswers } from '../submit/validate-answers.ts';
import { buildWorklogRecord } from '../submit/build-record.ts';

export interface WorkEntry {
  id: string;
  rowNumber: number; // 1-based sheet row
  phone: string;
  locked: boolean;
  hours: string;
  values: Record<string, string>;
}

function rowToObject(header: string[], row: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  header.forEach((h, i) => {
    if (h) o[h] = (row[i] ?? '').toString();
  });
  return o;
}

async function readEntries(gateway: SheetsGateway): Promise<{ header: string[]; entries: WorkEntry[] }> {
  const rows = await gateway.readTab('WorkLogs');
  if (rows.length === 0) return { header: [], entries: [] };
  const header = rows[0].map((h) => h.trim());
  const entries: WorkEntry[] = [];
  for (let k = 1; k < rows.length; k++) {
    const values = rowToObject(header, rows[k]);
    entries.push({
      id: (values.id ?? '').trim(),
      rowNumber: k + 1,
      phone: values.phone ?? '',
      locked: (values.locked ?? '').trim().toLowerCase() === 'yes',
      hours: values.hours ?? '',
      values,
    });
  }
  return { header, entries };
}

export async function listWorkerEntries(gateway: SheetsGateway, phone: string): Promise<WorkEntry[]> {
  const target = normalizePhone(phone);
  const { entries } = await readEntries(gateway);
  return entries.filter((e) => normalizePhone(e.phone) === target).reverse();
}

export async function getEntry(gateway: SheetsGateway, id: string): Promise<WorkEntry | null> {
  const t = (id ?? '').trim();
  if (!t) return null;
  const { entries } = await readEntries(gateway);
  return entries.find((e) => e.id === t) ?? null;
}

export async function updateEntry(
  gateway: SheetsGateway,
  id: string,
  answers: Record<string, string>,
  worker: Worker,
  questions: Question[],
  tz: string,
  now: Date,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'forbidden' | 'locked' } | { ok: false; errors: Record<string, string> }> {
  const { header, entries } = await readEntries(gateway);
  const entry = entries.find((e) => e.id === (id ?? '').trim());
  if (!entry) return { ok: false, reason: 'not_found' };
  if (normalizePhone(entry.phone) !== normalizePhone(worker.phone)) return { ok: false, reason: 'forbidden' };
  if (entry.locked) return { ok: false, reason: 'locked' };

  const v = validateAnswers(questions, answers, worker, tz, now);
  if (!v.ok) return { ok: false, errors: v.errors };

  const { record } = buildWorklogRecord(worker, questions, answers, now);
  // preserve original logged_at, id, and locked
  record.logged_at = entry.values.logged_at ?? record.logged_at;
  record.id = entry.id;
  record.locked = entry.values.locked ?? '';
  await gateway.updateRow('WorkLogs', entry.rowNumber, objectToRow(record, header));
  return { ok: true };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: PASS.

- [ ] **Step 5: Update `packages/worklog-core/src/index.ts`** — add:

```ts
export type { WorkEntry } from './entries/entries.ts';
export { listWorkerEntries, getEntry, updateEntry } from './entries/entries.ts';
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @scourage/worklog-core typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(worklog-core): list/get/update worker entries"
```

---

### Task 4: worklog-core — session signing (pure crypto)

**Files:**
- Create: `packages/worklog-core/src/session/session.ts`
- Test: `packages/worklog-core/src/session/session.test.ts`
- Modify: `packages/worklog-core/src/index.ts`

**Interfaces:**
- Produces:
  - `createSession(phone: string, key: string): string` — `base64url({phone}) + "." + HMAC-SHA256`.
  - `readSession(value: string, key: string): { phone: string } | null` — verifies the HMAC (constant-time), parses; null on tamper/format/wrong-key.

- [ ] **Step 1: Write the failing test — `packages/worklog-core/src/session/session.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, readSession } from './session.ts';

const key = 'signing-key';

test('roundtrips a phone', () => {
  const v = createSession('15551230000', key);
  assert.deepEqual(readSession(v, key), { phone: '15551230000' });
});

test('rejects wrong key, tampered value, and garbage', () => {
  const v = createSession('15551230000', key);
  assert.equal(readSession(v, 'other-key'), null);
  assert.equal(readSession(v.slice(0, -2) + 'xx', key), null);
  assert.equal(readSession('garbage', key), null);
  assert.equal(readSession('', key), null);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: FAIL — cannot find `./session.ts`.

- [ ] **Step 3: Implement `packages/worklog-core/src/session/session.ts`**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function createSession(phone: string, key: string): string {
  const payload = Buffer.from(JSON.stringify({ phone })).toString('base64url');
  return `${payload}.${sign(payload, key)}`;
}

export function readSession(value: string, key: string): { phone: string } | null {
  if (!value || !value.includes('.')) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0 || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (obj && typeof obj.phone === 'string' && obj.phone) return { phone: obj.phone };
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: PASS.

- [ ] **Step 5: Update `packages/worklog-core/src/index.ts`** — add:

```ts
export { createSession, readSession } from './session/session.ts';
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(worklog-core): signed session token crypto"
```

---

### Task 5: web — session wiring (signing key + cookie + requireWorker)

**Files:**
- Create: `packages/web/lib/signing-key.ts` (pure — **no `server-only`**, so it's unit-testable)
- Create: `packages/web/lib/session.ts` (server-only — cookies + `requireWorker`)
- Test: `packages/web/lib/signing-key.test.ts`

**Interfaces:**
- Consumes: `parseServiceAccountJson` (sheets-helper); `createSession`, `readSession`, `findWorker`, `type Worker` (worklog-core); `getGateway` (lib/sheets).
- Produces:
  - From `lib/signing-key.ts` (pure): `deriveSigningKey(sessionSecret: string | undefined, serviceAccountJson: string | undefined): string`.
  - From `lib/session.ts` (server-only): `getSigningKey()`, `COOKIE_NAME = 'fc_session'`, `setSessionCookie(phone)`, `clearSessionCookie()`, `requireWorker(): Promise<Worker | null>`.

> **Why two files:** `lib/session.ts` begins with `import 'server-only'`, which throws under the plain Node test runner. Keeping `deriveSigningKey` in a `server-only`-free file lets it be unit-tested directly.

- [ ] **Step 1: Write the failing test — `packages/web/lib/signing-key.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSigningKey } from './signing-key.ts';

test('SESSION_SECRET wins when set', () => {
  assert.equal(deriveSigningKey('explicit-secret', '{"private_key":"PK"}'), 'explicit-secret');
});

test('derives a stable non-empty key from the service-account json when no SESSION_SECRET', () => {
  const a = deriveSigningKey(undefined, '{"client_email":"x","private_key":"PK"}');
  const b = deriveSigningKey(undefined, '{"client_email":"x","private_key":"PK"}');
  assert.equal(a, b);
  assert.ok(a.length > 20);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter @scourage/web test`
Expected: FAIL — cannot find `deriveSigningKey`.

- [ ] **Step 3: Implement `packages/web/lib/signing-key.ts`** (pure, no `server-only`)

```ts
import { createHmac } from 'node:crypto';
import { parseServiceAccountJson } from '@scourage/sheets-helper';

/** Choose/derive the session signing key. SESSION_SECRET wins; else derive from the SA key. */
export function deriveSigningKey(sessionSecret: string | undefined, serviceAccountJson: string | undefined): string {
  if (sessionSecret) return sessionSecret;
  if (!serviceAccountJson) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON');
  const creds = parseServiceAccountJson(serviceAccountJson);
  return createHmac('sha256', creds.private_key).update('flowcat-session').digest('base64url');
}
```

- [ ] **Step 4: Implement `packages/web/lib/session.ts`** (server-only)

```ts
import 'server-only';
import { cookies } from 'next/headers';
import { createSession, readSession, findWorker, type Worker } from '@scourage/worklog-core';
import { getGateway } from './sheets';
import { deriveSigningKey } from './signing-key';

export const COOKIE_NAME = 'fc_session';

export function getSigningKey(): string {
  return deriveSigningKey(process.env.SESSION_SECRET, process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

export async function setSessionCookie(phone: string): Promise<void> {
  const value = createSession(phone, getSigningKey());
  (await cookies()).set(COOKIE_NAME, value, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(COOKIE_NAME, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function requireWorker(): Promise<Worker | null> {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value) return null;
  const session = readSession(value, getSigningKey());
  if (!session) return null;
  return findWorker(getGateway(), session.phone);
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @scourage/web test && pnpm --filter @scourage/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/lib/signing-key.ts packages/web/lib/session.ts packages/web/lib/signing-key.test.ts
git commit -m "feat(web): session signing key (derived) + cookie + requireWorker"
```

---

### Task 6: web — `/login` page + login/logout routes

**Files:**
- Create: `packages/web/app/login/page.tsx`
- Create: `packages/web/app/login/login-form.tsx`
- Create: `packages/web/app/api/login/route.ts`
- Create: `packages/web/app/api/logout/route.ts`

**Interfaces:**
- Consumes: `authenticateWorker` (worklog-core); `getGateway` (lib/sheets); `setSessionCookie`, `clearSessionCookie` (lib/session).
- Produces: a working login → cookie → redirect flow.

- [ ] **Step 1: Create `packages/web/app/api/login/route.ts`**

```ts
import { getGateway } from '../../../lib/sheets';
import { setSessionCookie } from '../../../lib/session';
import { authenticateWorker } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
  const { phone, teudatZeut } = (body ?? {}) as { phone?: unknown; teudatZeut?: unknown };
  if (typeof phone !== 'string' || typeof teudatZeut !== 'string') {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
  try {
    const worker = await authenticateWorker(getGateway(), phone, teudatZeut);
    if (!worker) {
      return Response.json({ error: "Phone number or teudat zeut didn't match." }, { status: 401 });
    }
    await setSessionCookie(worker.phone);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('login failed (sheets):', err);
    return Response.json({ error: 'Service unavailable, try again.' }, { status: 503 });
  }
}
```

- [ ] **Step 2: Create `packages/web/app/api/logout/route.ts`**

```ts
import { clearSessionCookie } from '../../../lib/session';

export const runtime = 'nodejs';

export async function POST() {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Create `packages/web/app/login/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { requireWorker } from '../../lib/session';
import { LoginForm } from './login-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const worker = await requireWorker();
  if (worker) redirect('/app');
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">FlowCat — Log in</h1>
      <p className="mt-1 text-sm text-gray-600">Enter your phone number and teudat zeut.</p>
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 4: Create `packages/web/app/login/login-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [teudatZeut, setTeudatZeut] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, teudatZeut }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        router.replace('/app');
        router.refresh();
      } else {
        setError(data.error ?? 'Login failed.');
        setBusy(false);
      }
    } catch {
      setError('Network error, try again.');
      setBusy(false);
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <div>
        <label className="block text-sm font-medium text-gray-700">Phone</label>
        <input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base" type="tel"
          value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Teudat zeut</label>
        <input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base" type="text"
          inputMode="numeric" value={teudatZeut} onChange={(e) => setTeudatZeut(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
        {busy ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Typecheck + build**

Run: `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/login packages/web/app/api/login packages/web/app/api/logout
git commit -m "feat(web): /login page + login/logout routes"
```

---

### Task 7: web — session-based `/api/submit`; remove the token page

**Files:**
- Modify: `packages/web/app/api/submit/route.ts` (identity from session, not token)
- Delete: `packages/web/app/w/[token]/page.tsx`, `packages/web/app/w/[token]/worker-form.tsx`
- Create: `packages/web/app/app/entry-form.tsx` (the form, no token; posts `{answers}`)

**Interfaces:**
- Consumes: `requireWorker` (lib/session); `getGateway`, `COMPANY_TZ` (lib/sheets); `loadQuestions`, `validateQuestions`, `submitWorklog` (worklog-core); `questionToWidget` (lib/form-widgets).
- Produces: `EntryForm` client component (used by `/app` in Task 8) posting `{answers}` to `/api/submit`.

- [ ] **Step 1: Rewrite `packages/web/app/api/submit/route.ts`**

```ts
import { getGateway, COMPANY_TZ } from '../../../lib/sheets';
import { requireWorker } from '../../../lib/session';
import { loadQuestions, validateQuestions, submitWorklog } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const worker = await requireWorker();
  if (!worker || !worker.active) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const { answers } = (body ?? {}) as { answers?: unknown };
  if (typeof answers !== 'object' || answers === null) {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }

  try {
    const questions = await loadQuestions(getGateway());
    const valid = validateQuestions(questions);
    if (!valid.ok) return Response.json({ error: 'not set up' }, { status: 503 });
    const result = await submitWorklog(getGateway(), worker, questions, answers as Record<string, string>, COMPANY_TZ, new Date());
    if (!result.ok) return Response.json({ errors: result.errors }, { status: 400 });
    return Response.json({ ok: true, hours: result.hours });
  } catch (err) {
    console.error('submit failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
```

- [ ] **Step 2: Delete the old token page**

Run:
```bash
git rm packages/web/app/w/[token]/page.tsx packages/web/app/w/[token]/worker-form.tsx
```

- [ ] **Step 3: Create `packages/web/app/app/entry-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { Widget } from '../../lib/form-widgets';

export function EntryForm({ widgets, today }: { widgets: Widget[]; today: string }) {
  const initial: Record<string, string> = {};
  for (const w of widgets) initial[w.key] = w.kind === 'date' ? today : '';

  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [hours, setHours] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const set = (key: string, value: string) => setAnswers((a) => ({ ...a, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setErrors({});
    setFatal(null);
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setHours(data.hours ?? null);
        setStatus('done');
      } else if (res.status === 400 && data.errors) {
        setErrors(data.errors);
        setStatus('idle');
      } else {
        setFatal('Could not save. Please try again.');
        setStatus('idle');
      }
    } catch {
      setFatal('Network error. Please try again.');
      setStatus('idle');
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
        <div className="text-2xl">✅</div>
        <p className="mt-1 font-medium">Logged{hours ? ` ${hours}h` : ''}</p>
        <button className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
          onClick={() => { setAnswers(initial); setStatus('idle'); }}>Log another</button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {widgets.map((w) => (
        <div key={w.key}>
          <label className="block text-sm font-medium text-gray-700">
            {w.label}{!w.required && <span className="text-gray-400"> (optional)</span>}
          </label>
          {w.kind === 'select' ? (
            <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
              value={answers[w.key]} onChange={(e) => set(w.key, e.target.value)}>
              <option value="">Choose…</option>
              {w.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
              type={w.kind === 'date' ? 'date' : w.kind === 'time' ? 'time' : w.kind === 'number' ? 'number' : 'text'}
              value={answers[w.key]} max={w.kind === 'date' ? today : undefined}
              onChange={(e) => set(w.key, e.target.value)} />
          )}
          {errors[w.key] && <p className="mt-1 text-sm text-red-600">{errors[w.key]}</p>}
        </div>
      ))}
      {fatal && <p className="text-sm text-red-600">{fatal}</p>}
      <button type="submit" disabled={status === 'saving'}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
        {status === 'saving' ? 'Saving…' : 'Submit'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`
Expected: PASS. (The `/app` page that imports `EntryForm` is Task 8 — build still compiles since nothing references the deleted `/w` route.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): session-based /api/submit; remove token page; entry form"
```

---

### Task 8: web — authed `/app` (entry + My hours)

**Files:**
- Create: `packages/web/app/app/page.tsx`
- Create: `packages/web/app/app/logout-button.tsx`

**Interfaces:**
- Consumes: `requireWorker`, `getGateway`, `COMPANY_TZ`; `loadQuestions`, `validateQuestions`, `listWorkerEntries`, `todayISO`, `type Question`, `type WorkEntry` (worklog-core); `questionToWidget` (lib/form-widgets); `EntryForm` (Task 7).
- Produces: the authed worker home page.

- [ ] **Step 1: Create `packages/web/app/app/logout-button.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="text-sm text-gray-500 underline"
      onClick={async () => {
        await fetch('/api/logout', { method: 'POST' });
        router.replace('/login');
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
```

- [ ] **Step 2: Create `packages/web/app/app/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { requireWorker } from '../../lib/session';
import { getGateway, COMPANY_TZ } from '../../lib/sheets';
import { loadQuestions, validateQuestions, listWorkerEntries, todayISO } from '@scourage/worklog-core';
import { questionToWidget } from '../../lib/form-widgets';
import { EntryForm } from './entry-form';
import { LogoutButton } from './logout-button';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AppPage() {
  const worker = await requireWorker();
  if (!worker || !worker.active) redirect('/login');

  const gw = getGateway();
  const questions = await loadQuestions(gw);
  const valid = validateQuestions(questions);
  const entries = await listWorkerEntries(gw, worker.phone);
  const totalHours = entries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);

  const fieldKeys = questions.map((q) => q.key);

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{worker.greeting || `Hi ${worker.name}!`}</h1>
        <LogoutButton />
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">New entry</h2>
        {valid.ok && worker.places.length > 0 ? (
          <div className="mt-3">
            <EntryForm widgets={questions.map((q) => questionToWidget(q, worker))} today={todayISO(COMPANY_TZ)} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-600">
            {worker.places.length === 0 ? 'No work sites assigned yet — ask your manager.' : 'Not set up yet — ask your manager.'}
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          My hours {totalHours > 0 && <span className="text-gray-400">· {Math.round(totalHours * 100) / 100}h total</span>}
        </h2>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No entries yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200">
            {entries.map((e) => (
              <li key={e.id || e.rowNumber} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <div className="font-medium">{fieldKeys.map((k) => e.values[k]).filter(Boolean).join(' · ')}</div>
                  {e.hours && <div className="text-gray-500">{e.hours}h</div>}
                </div>
                {e.locked || !e.id ? (
                  <span className="text-gray-400">🔒</span>
                ) : (
                  <a className="text-blue-600 underline" href={`/app/edit/${e.id}`}>Edit</a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/app/page.tsx packages/web/app/app/logout-button.tsx
git commit -m "feat(web): authed /app — entry form + My hours review"
```

---

### Task 9: web — edit an entry (`/app/edit/[id]` + PATCH)

**Files:**
- Create: `packages/web/app/app/edit/[id]/page.tsx`
- Create: `packages/web/app/app/edit/[id]/edit-form.tsx`
- Create: `packages/web/app/api/entries/[id]/route.ts`

**Interfaces:**
- Consumes: `requireWorker`, `getGateway`, `COMPANY_TZ`; `loadQuestions`, `validateQuestions`, `getEntry`, `updateEntry`, `todayISO` (worklog-core); `questionToWidget` (lib/form-widgets).
- Produces: edit page + `PATCH /api/entries/[id]`.

- [ ] **Step 1: Create `packages/web/app/api/entries/[id]/route.ts`**

```ts
import { getGateway, COMPANY_TZ } from '../../../../lib/sheets';
import { requireWorker } from '../../../../lib/session';
import { loadQuestions, validateQuestions, updateEntry } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const worker = await requireWorker();
  if (!worker || !worker.active) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const { answers } = (body ?? {}) as { answers?: unknown };
  if (typeof answers !== 'object' || answers === null) {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }

  try {
    const questions = await loadQuestions(getGateway());
    const valid = validateQuestions(questions);
    if (!valid.ok) return Response.json({ error: 'not set up' }, { status: 503 });
    const r = await updateEntry(getGateway(), id, answers as Record<string, string>, worker, questions, COMPANY_TZ, new Date());
    if (r.ok) return Response.json({ ok: true });
    if ('errors' in r) return Response.json({ errors: r.errors }, { status: 400 });
    if (r.reason === 'locked' || r.reason === 'forbidden') return Response.json({ error: r.reason }, { status: 403 });
    return Response.json({ error: 'not found' }, { status: 404 });
  } catch (err) {
    console.error('edit failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
```

- [ ] **Step 2: Create `packages/web/app/app/edit/[id]/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { requireWorker } from '../../../../lib/session';
import { getGateway, COMPANY_TZ } from '../../../../lib/sheets';
import { loadQuestions, validateQuestions, getEntry, todayISO, normalizePhone } from '@scourage/worklog-core';
import { questionToWidget } from '../../../../lib/form-widgets';
import { EditForm } from './edit-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const worker = await requireWorker();
  if (!worker || !worker.active) redirect('/login');
  const { id } = await params;

  const gw = getGateway();
  const entry = await getEntry(gw, id);
  if (!entry || normalizePhone(entry.phone) !== normalizePhone(worker.phone) || entry.locked || !entry.id) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <p className="text-gray-600">This entry can’t be edited.</p>
        <a className="mt-3 inline-block text-blue-600 underline" href="/app">Back</a>
      </main>
    );
  }

  const questions = await loadQuestions(gw);
  const valid = validateQuestions(questions);
  if (!valid.ok) redirect('/app');

  const widgets = questions.map((q) => questionToWidget(q, worker));
  const initial: Record<string, string> = {};
  for (const q of questions) initial[q.key] = entry.values[q.key] ?? '';

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="text-xl font-semibold">Edit entry</h1>
      <div className="mt-6">
        <EditForm id={entry.id} widgets={widgets} initial={initial} today={todayISO(COMPANY_TZ)} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create `packages/web/app/app/edit/[id]/edit-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Widget } from '../../../../lib/form-widgets';

type Props = { id: string; widgets: Widget[]; initial: Record<string, string>; today: string };

export function EditForm({ id, widgets, initial, today }: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: string, value: string) => setAnswers((a) => ({ ...a, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFatal(null);
    try {
      const res = await fetch(`/api/entries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        router.replace('/app');
        router.refresh();
      } else if (res.status === 400 && data.errors) {
        setErrors(data.errors);
        setBusy(false);
      } else {
        setFatal(res.status === 403 ? 'This entry is locked.' : 'Could not save. Try again.');
        setBusy(false);
      }
    } catch {
      setFatal('Network error. Try again.');
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {widgets.map((w) => (
        <div key={w.key}>
          <label className="block text-sm font-medium text-gray-700">{w.label}</label>
          {w.kind === 'select' ? (
            <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
              value={answers[w.key] ?? ''} onChange={(e) => set(w.key, e.target.value)}>
              <option value="">Choose…</option>
              {w.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
              type={w.kind === 'date' ? 'date' : w.kind === 'time' ? 'time' : w.kind === 'number' ? 'number' : 'text'}
              value={answers[w.key] ?? ''} max={w.kind === 'date' ? today : undefined}
              onChange={(e) => set(w.key, e.target.value)} />
          )}
          {errors[w.key] && <p className="mt-1 text-sm text-red-600">{errors[w.key]}</p>}
        </div>
      ))}
      {fatal && <p className="text-sm text-red-600">{fatal}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={busy}
          className="flex-1 rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'Save'}
        </button>
        <a href="/app" className="rounded-lg border border-gray-300 px-4 py-3 text-base">Cancel</a>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/app/edit packages/web/app/api/entries
git commit -m "feat(web): edit an unlocked entry (/app/edit/[id] + PATCH)"
```

---

### Task 10: web — landing redirect, docs, env example, final verification

**Files:**
- Modify: `packages/web/app/page.tsx` (redirect `/` → `/app`)
- Modify: `packages/web/.env.local.example` (note optional `SESSION_SECRET`)
- Modify: `packages/web/README.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: a clean entry point + updated docs.

- [ ] **Step 1: Rewrite `packages/web/app/page.tsx`**

```tsx
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function Home() {
  redirect('/app');
}
```
(`/app` itself redirects to `/login` when not authenticated, so `/` lands users in the right place.)

- [ ] **Step 2: Update `packages/web/.env.local.example`** — append:

```
# Optional: overrides the session-cookie signing key.
# If unset, it is derived from GOOGLE_SERVICE_ACCOUNT_JSON (no action needed).
SESSION_SECRET=
```

- [ ] **Step 3: Update `packages/web/README.md`** — replace the worker-flow description with:

```markdown
## Worker app
- `/login` — workers log in with **phone + teudat zeut** (matched against the `Workers` tab's `phone` + `teudat_zeut` columns).
- `/app` — enter a new shift, and review/edit your own hours. Entries with `locked = yes` in the `WorkLogs` tab are read-only.
- Session is a browser-session cookie (clears on close). The signing key is derived from `GOOGLE_SERVICE_ACCOUNT_JSON` — **no extra env var needed**.

### Sheet columns this expects
- **Workers:** `phone · name · greeting · places · active · teudat_zeut`
- **WorkLogs:** `logged_at · phone · name · id · <question keys> · hours · locked` (the bot/app add `id`/`locked` automatically on new entries; admins set `locked = yes` to freeze a row).
```

- [ ] **Step 4: Final verification**

Run:
```bash
pnpm -r typecheck
pnpm -r test
pnpm --filter @scourage/web build
```
Expected: typecheck clean, all tests PASS, web build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(web): / → /app redirect + auth/edit docs"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** `updateRow` (Task 1); teudat-zeut auth + entry id/locked (Task 2); list/get/update entries (Task 3); session crypto (Task 4); web session wiring + derived signing key, no new env var (Task 5); `/login` + login/logout (Task 6); session-based submit + token page removed (Task 7); authed `/app` with review (Task 8); edit with lock/ownership guards (Task 9); landing + docs (Task 10).
- **PII:** teudat zeut is only read in `/api/login`'s body, compared in `authenticateWorker`, and never logged / never placed in the cookie (cookie holds only `phone`) / never returned to the client.
- **Bot safety:** `appendWorkLog` only adds `id`/`locked` when the record carries them, so the parked `whatsapp-bot` engine + its tests are unaffected; only `submitWorklog` (web) sets them.
- **Type consistency:** `Worker.teudatZeut` (Task 2) is used in auth (Task 2/6) and literals updated; `WorkEntry` (Task 3) is consumed by `/app` (Task 8) and edit (Task 9); `createSession`/`readSession` (Task 4) used by `lib/session` (Task 5); `Widget` reused by entry + edit forms.
- **Known follow-ups (deferred):** login rate-limiting; `id` backfill for old rows; the FlowCat visual + multi-shift features; admin UI.
