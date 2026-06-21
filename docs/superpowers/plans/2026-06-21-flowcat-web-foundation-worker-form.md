# FlowCat Web — Foundation + Worker Form (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the channel-agnostic core into a shared package, then build a Next.js worker form at `/w/<token>` (rendered from the `Questions` tab, with native calendar/time pickers) that writes a `WorkLogs` row to the Google Sheet — deployable to Vercel.

**Architecture:** A pnpm monorepo. `worklog-core` holds the channel-agnostic domain (data, questions, time, submit) extracted from `whatsapp-bot`. `sheets-helper` is extended to accept inline service-account credentials (for Vercel's no-filesystem env). A new `packages/web` Next.js (App Router) app reads/writes the Sheet **server-side only** and renders the worker form from the live `Questions` config. The chat bot is parked but kept building.

**Tech Stack:** Next.js 15 (App Router) + React 19, TypeScript, Tailwind CSS, `googleapis`, Node's built-in test runner via `tsx`. Deployed on Vercel.

## Global Constraints

- **Node ≥ 22**, ESM (`"type": "module"`) everywhere. Relative imports use explicit `.ts`/`.tsx` extensions in `worklog-core`/`sheets-helper` (existing convention); the Next.js `web` package uses Next's normal resolution (no extension needed in `app/`/`lib`, but workspace package imports are bare specifiers).
- **pnpm only.** Workspace packages: `@scourage/sheets-helper`, `@scourage/worklog-core`, `@scourage/web`.
- **No secrets in git.** `.env`, `.env.local`, `*.key.json` stay gitignored. Service-account creds reach Vercel via the `GOOGLE_SERVICE_ACCOUNT_JSON` env var.
- **All Google Sheets access is server-side only** in `web` (Route Handlers / server components). Never import `lib/sheets.ts` from a client component; it is marked `import 'server-only'`.
- **Tests:** Node built-in runner (`node:test` + `node:assert/strict`) via `tsx`. Pure logic is tested; React components are verified manually (Playwright E2E is a later option).
- **Worker identity = magic-link token.** Server NEVER trusts client-supplied identity; it re-loads the worker by token and re-validates every answer.
- **Do not run `git push`** in any task — local commits only. (Pushes to `OneStromberg/flow-cat` are handled outside the plan.)
- **UI:** Tailwind only for v1 (no shadcn/component-library install) — keeps deps minimal; matches the "clean & functional, ship fast" intent. Worker form is mobile-first with native `<input type="date"/"time">`.

---

### Task 1: sheets-helper — accept inline credentials

**Files:**
- Create: `packages/sheets-helper/src/credentials.ts`
- Create: `packages/sheets-helper/src/auth.ts`
- Modify: `packages/sheets-helper/src/google-gateway.ts`
- Modify: `packages/sheets-helper/src/ensure-tabs.ts`
- Modify: `packages/sheets-helper/src/index.ts`
- Test: `packages/sheets-helper/src/credentials.test.ts`

**Interfaces:**
- Produces:
  - `interface ServiceAccountCredentials { client_email: string; private_key: string; [k: string]: unknown }`
  - `parseServiceAccountJson(json: string): ServiceAccountCredentials` — JSON.parse + validate; throws on bad input.
  - `interface SheetsAuthOptions { spreadsheetId: string; keyFilePath?: string; credentials?: ServiceAccountCredentials }`
  - `buildSheetsAuth(opts: SheetsAuthOptions)` — returns a `google.auth.GoogleAuth`; prefers `credentials`, else `keyFilePath`, else throws.
  - `createGoogleGateway(opts: SheetsAuthOptions): SheetsGateway` and `ensureTabs(opts: SheetsAuthOptions, tabs: string[])` now take the options object (back-compatible — existing callers pass `{ keyFilePath, spreadsheetId }`).

- [ ] **Step 1: Write the failing test — `packages/sheets-helper/src/credentials.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseServiceAccountJson } from './credentials.ts';
import { buildSheetsAuth } from './auth.ts';

test('parses a valid service-account JSON', () => {
  const json = JSON.stringify({ client_email: 'a@b.iam', private_key: 'KEY', project_id: 'p' });
  const c = parseServiceAccountJson(json);
  assert.equal(c.client_email, 'a@b.iam');
  assert.equal(c.private_key, 'KEY');
});

test('rejects unparseable or incomplete JSON', () => {
  assert.throws(() => parseServiceAccountJson('not json'), /not parseable/);
  assert.throws(() => parseServiceAccountJson('{"client_email":"x"}'), /missing/);
});

test('buildSheetsAuth throws when neither creds nor keyFile given', () => {
  assert.throws(() => buildSheetsAuth({ spreadsheetId: 's' }), /provide keyFilePath or credentials/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scourage/sheets-helper test`
Expected: FAIL — cannot find `./credentials.ts`.

- [ ] **Step 3: Create `packages/sheets-helper/src/credentials.ts`**

```ts
export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  [k: string]: unknown;
}

export function parseServiceAccountJson(json: string): ServiceAccountCredentials {
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error('Invalid service-account JSON: not parseable');
  }
  const c = obj as Record<string, unknown>;
  if (typeof c.client_email !== 'string' || typeof c.private_key !== 'string') {
    throw new Error('Invalid service-account JSON: missing client_email/private_key');
  }
  return c as ServiceAccountCredentials;
}
```

- [ ] **Step 4: Create `packages/sheets-helper/src/auth.ts`**

```ts
import { google } from 'googleapis';
import type { ServiceAccountCredentials } from './credentials.ts';

export interface SheetsAuthOptions {
  spreadsheetId: string;
  keyFilePath?: string;
  credentials?: ServiceAccountCredentials;
}

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export function buildSheetsAuth(opts: SheetsAuthOptions) {
  if (opts.credentials) return new google.auth.GoogleAuth({ credentials: opts.credentials, scopes: SCOPES });
  if (opts.keyFilePath) return new google.auth.GoogleAuth({ keyFile: opts.keyFilePath, scopes: SCOPES });
  throw new Error('sheets-helper: provide keyFilePath or credentials');
}
```

- [ ] **Step 5: Rewrite `packages/sheets-helper/src/google-gateway.ts`**

```ts
import { google } from 'googleapis';
import type { SheetsGateway } from './gateway.ts';
import { buildSheetsAuth, type SheetsAuthOptions } from './auth.ts';

export function createGoogleGateway(opts: SheetsAuthOptions): SheetsGateway {
  const sheets = google.sheets({ version: 'v4', auth: buildSheetsAuth(opts) });
  const { spreadsheetId } = opts;

  return {
    async readTab(tab) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: tab });
      return (res.data.values ?? []) as string[][];
    },
    async writeHeaderRow(tab, headers) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!1:1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
    },
    async appendRow(tab, row) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: tab,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      });
    },
  };
}
```

- [ ] **Step 6: Rewrite `packages/sheets-helper/src/ensure-tabs.ts`**

```ts
import { google } from 'googleapis';
import { buildSheetsAuth, type SheetsAuthOptions } from './auth.ts';

/**
 * Ensure each named tab exists, creating any that are missing.
 * Returns the list of tabs that were created.
 */
export async function ensureTabs(opts: SheetsAuthOptions, tabs: string[]): Promise<string[]> {
  const sheets = google.sheets({ version: 'v4', auth: buildSheetsAuth(opts) });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: opts.spreadsheetId });
  const existing = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
  const toCreate = tabs.filter((t) => !existing.has(t));
  if (toCreate.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: opts.spreadsheetId,
      requestBody: { requests: toCreate.map((title) => ({ addSheet: { properties: { title } } })) },
    });
  }
  return toCreate;
}
```

- [ ] **Step 7: Update `packages/sheets-helper/src/index.ts`**

```ts
export type { SheetsGateway } from './gateway.ts';
export { rowsToObjects, objectToRow } from './rows.ts';
export { createMemoryGateway } from './memory-gateway.ts';
export { createGoogleGateway } from './google-gateway.ts';
export { ensureTabs } from './ensure-tabs.ts';
export { parseServiceAccountJson, type ServiceAccountCredentials } from './credentials.ts';
export { buildSheetsAuth, type SheetsAuthOptions } from './auth.ts';
```

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm --filter @scourage/sheets-helper test && pnpm --filter @scourage/sheets-helper typecheck`
Expected: PASS (existing + 3 new tests), typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add packages/sheets-helper
git commit -m "feat(sheets-helper): accept inline service-account credentials"
```

---

### Task 2: Create `worklog-core` and move the channel-agnostic domain

**Files:**
- Create: `packages/worklog-core/package.json`
- Create: `packages/worklog-core/tsconfig.json`
- Create: `packages/worklog-core/src/index.ts`
- Move: `packages/whatsapp-bot/src/data/*` → `packages/worklog-core/src/data/*`
- Move: `packages/whatsapp-bot/src/questions/*` → `packages/worklog-core/src/questions/*`
- Move: `packages/whatsapp-bot/src/time/*` → `packages/worklog-core/src/time/*`
- Modify: every `whatsapp-bot` file that imported `../data/...`, `../questions/...`, `../time/...`
- Modify: `packages/whatsapp-bot/package.json` (add `@scourage/worklog-core` dep)

**Interfaces:**
- Consumes: `@scourage/sheets-helper`.
- Produces: `@scourage/worklog-core` exporting (from `index.ts`): types `Worker`, `Question`, `QuestionType`; functions `normalizePhone`, `findWorker`, `loadActivePlaces`, `appendWorkLog`, `loadQuestions`, `validateQuestions`, `parseClockTime`, `computeHours`, `todayISO`, `yesterdayISO`, `resolveTypedDate`.

- [ ] **Step 1: Create `packages/worklog-core/package.json`**

```json
{
  "name": "@scourage/worklog-core",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "node --import tsx --test \"src/**/*.test.ts\"",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@scourage/sheets-helper": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/worklog-core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "allowImportingTsExtensions": true },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Move the three directories (with history)**

Run:
```bash
mkdir -p packages/worklog-core/src
git mv packages/whatsapp-bot/src/data packages/worklog-core/src/data
git mv packages/whatsapp-bot/src/questions packages/worklog-core/src/questions
git mv packages/whatsapp-bot/src/time packages/worklog-core/src/time
```

- [ ] **Step 4: Drop the dead re-export in `packages/worklog-core/src/data/worklogs.ts`**

Remove the trailing two lines (the unused re-export):
```ts
// re-export for callers that want to read back (kept minimal; unused by bot today)
export { rowsToObjects };
```
Also remove `rowsToObjects` from that file's top import (keep `objectToRow`, `type SheetsGateway`):
```ts
import { objectToRow, type SheetsGateway } from '@scourage/sheets-helper';
```

- [ ] **Step 5: Create `packages/worklog-core/src/index.ts`**

```ts
export type { Worker } from './data/workers.ts';
export { findWorker } from './data/workers.ts';
export { loadActivePlaces } from './data/places.ts';
export { appendWorkLog } from './data/worklogs.ts';
export { normalizePhone } from './data/phone.ts';
export type { Question, QuestionType } from './questions/types.ts';
export { loadQuestions } from './questions/load-questions.ts';
export { validateQuestions } from './questions/validate-config.ts';
export { parseClockTime, computeHours } from './time/clock.ts';
export { todayISO, yesterdayISO, resolveTypedDate } from './time/dates.ts';
```

- [ ] **Step 6: Update whatsapp-bot imports**

In every `whatsapp-bot/src/**/*.ts` that imported the moved modules, replace relative paths with the package. Run this to find them:
```bash
grep -rln "from '\.\./\(data\|questions\|time\)/" packages/whatsapp-bot/src
grep -rln "from '\./\(data\|questions\|time\)/" packages/whatsapp-bot/src
```
For each hit, change e.g.:
```ts
import { findWorker, type Worker } from '../data/workers.ts';
import { parseClockTime, computeHours } from '../time/clock.ts';
import type { Question } from '../questions/types.ts';
import { validateQuestions } from '../questions/validate-config.ts';
import { loadQuestions } from '../questions/load-questions.ts';
```
to:
```ts
import { findWorker, parseClockTime, computeHours, validateQuestions, loadQuestions, type Worker, type Question } from '@scourage/worklog-core';
```
Consolidate per-file as needed. The affected files are: `conversation/engine.ts`, `conversation/render-question.ts`, `conversation/parse-answer.ts`, `conversation/session-store.ts`, `app.ts`, `local/repl.ts`, and any test files under `whatsapp-bot/src` that imported them (e.g. `conversation/*.test.ts`, `data` tests already moved). Update each import to the package specifier. **Do not** change imports inside files that physically moved into `worklog-core` (their relative imports to sibling moved modules still resolve).

- [ ] **Step 7: Add the dependency to whatsapp-bot**

In `packages/whatsapp-bot/package.json` `dependencies`, add:
```json
"@scourage/worklog-core": "workspace:*"
```

- [ ] **Step 8: Install + run everything**

Run:
```bash
pnpm install
pnpm --filter @scourage/worklog-core test
pnpm --filter @scourage/worklog-core typecheck
pnpm --filter @scourage/whatsapp-bot test
pnpm --filter @scourage/whatsapp-bot typecheck
```
Expected: all PASS. (The moved tests now run under `worklog-core`; the bot's engine/conversation tests still pass importing from the package.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: extract worklog-core (data/questions/time) from whatsapp-bot"
```

---

### Task 3: worklog-core — buildWorklogRecord, validateAnswers, submitWorklog

**Files:**
- Create: `packages/worklog-core/src/submit/build-record.ts`
- Create: `packages/worklog-core/src/submit/validate-answers.ts`
- Create: `packages/worklog-core/src/submit/submit-worklog.ts`
- Test: `packages/worklog-core/src/submit/build-record.test.ts`
- Test: `packages/worklog-core/src/submit/validate-answers.test.ts`
- Test: `packages/worklog-core/src/submit/submit-worklog.test.ts`
- Modify: `packages/worklog-core/src/index.ts`
- Modify: `packages/whatsapp-bot/src/conversation/engine.ts` (use `buildWorklogRecord`)

**Interfaces:**
- Consumes: `Question`, `Worker`, `parseClockTime`, `computeHours`, `todayISO`, `appendWorkLog`, `SheetsGateway`.
- Produces:
  - `buildWorklogRecord(worker: {phone:string;name:string}, questions: Question[], answers: Record<string,string>, now: Date): { record: Record<string,string>; keys: string[] }`
  - `validateAnswers(questions: Question[], answers: Record<string,string>, worker: Worker, tz: string, now: Date): { ok: true } | { ok: false; errors: Record<string,string> }`
  - `submitWorklog(gateway, worker, questions, answers, tz, now): Promise<{ ok: true; hours: string | null } | { ok: false; errors: Record<string,string> }>`

- [ ] **Step 1: Write the failing test — `packages/worklog-core/src/submit/build-record.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorklogRecord } from './build-record.ts';
import type { Question } from '../questions/types.ts';

const q = (o: Partial<Question>): Question => ({ order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...o });
const now = new Date('2026-06-20T09:00:00Z');

test('builds record with computed hours from start+end', () => {
  const questions = [
    q({ key: 'place', type: 'worker_places' }),
    q({ key: 'start', type: 'time' }),
    q({ key: 'end', type: 'time' }),
  ];
  const { record, keys } = buildWorklogRecord({ phone: '555', name: 'John' }, questions,
    { place: 'Warehouse', start: '08:00', end: '16:30' }, now);
  assert.equal(record.phone, '555');
  assert.equal(record.place, 'Warehouse');
  assert.equal(record.hours, '8.5');
  assert.deepEqual(keys, ['place', 'start', 'end']);
});

test('no hours column when no start/end time pair', () => {
  const questions = [q({ key: 'place', type: 'worker_places' })];
  const { record } = buildWorklogRecord({ phone: '5', name: 'J' }, questions, { place: 'W' }, now);
  assert.equal(record.hours, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: FAIL — cannot find `./build-record.ts`.

- [ ] **Step 3: Implement `packages/worklog-core/src/submit/build-record.ts`**

```ts
import type { Question } from '../questions/types.ts';
import { parseClockTime, computeHours } from '../time/clock.ts';

export function buildWorklogRecord(
  worker: { phone: string; name: string },
  questions: Question[],
  answers: Record<string, string>,
  now: Date,
): { record: Record<string, string>; keys: string[] } {
  const record: Record<string, string> = {
    logged_at: now.toISOString(),
    phone: worker.phone,
    name: worker.name,
  };
  for (const qq of questions) record[qq.key] = answers[qq.key] ?? '';

  const startQ = questions.find((x) => x.key === 'start' && x.type === 'time');
  const endQ = questions.find((x) => x.key === 'end' && x.type === 'time');
  if (startQ && endQ && answers['start'] && answers['end']) {
    const s = parseClockTime(answers['start']);
    const e = parseClockTime(answers['end']);
    if (s && e) {
      const h = computeHours(s, e);
      if (h !== null) record['hours'] = String(h);
    }
  }
  return { record, keys: questions.map((x) => x.key) };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: PASS.

- [ ] **Step 5: Write the failing test — `packages/worklog-core/src/submit/validate-answers.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnswers } from './validate-answers.ts';
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';

const q = (o: Partial<Question>): Question => ({ order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...o });
const worker: Worker = { phone: '5', name: 'J', greeting: '', places: ['Warehouse', 'Office HQ'], active: true, token: 't' };
const tz = 'Asia/Jerusalem';
const now = new Date('2026-06-20T09:00:00Z');
const questions = [
  q({ key: 'place', type: 'worker_places' }),
  q({ key: 'date', type: 'date' }),
  q({ key: 'start', type: 'time' }),
  q({ key: 'end', type: 'time' }),
  q({ key: 'notes', type: 'text', required: false }),
];

test('accepts a valid answer set', () => {
  const r = validateAnswers(questions, { place: 'Warehouse', date: '2026-06-19', start: '08:00', end: '16:30', notes: '' }, worker, tz, now);
  assert.deepEqual(r, { ok: true });
});

test('flags required-missing, bad place, future date, bad time, end<=start', () => {
  const r = validateAnswers(questions, { place: 'Nope', date: '2026-06-25', start: 'xx', end: '07:00' }, worker, tz, now);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.errors.place, 'Not one of your sites');
    assert.equal(r.errors.date, 'Date is in the future');
    assert.equal(r.errors.start, 'Invalid time (HH:MM)');
    // end vs start cross-check only runs when both parse; start is invalid here so end stays required-ok
  }
});

test('end must be after start when both valid', () => {
  const r = validateAnswers(questions, { place: 'Warehouse', date: '2026-06-19', start: '16:00', end: '09:00' }, worker, tz, now);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.end, 'Finish must be after start');
});
```

- [ ] **Step 6: Implement `packages/worklog-core/src/submit/validate-answers.ts`**

```ts
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';
import { parseClockTime } from '../time/clock.ts';
import { todayISO } from '../time/dates.ts';

export function validateAnswers(
  questions: Question[],
  answers: Record<string, string>,
  worker: Worker,
  tz: string,
  now: Date,
): { ok: true } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  for (const q of questions) {
    const raw = (answers[q.key] ?? '').trim();
    if (raw === '') {
      if (q.required) errors[q.key] = 'Required';
      continue;
    }
    switch (q.type) {
      case 'worker_places':
        if (!worker.places.some((p) => p.toLowerCase() === raw.toLowerCase())) errors[q.key] = 'Not one of your sites';
        break;
      case 'choice':
        if (!q.options.some((o) => o.toLowerCase() === raw.toLowerCase())) errors[q.key] = 'Not a valid option';
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) errors[q.key] = 'Invalid date';
        else if (raw > todayISO(tz, now)) errors[q.key] = 'Date is in the future';
        break;
      case 'time':
        if (!parseClockTime(raw)) errors[q.key] = 'Invalid time (HH:MM)';
        break;
      case 'number':
        if (!Number.isFinite(Number(raw))) errors[q.key] = 'Must be a number';
        break;
      // text: any non-empty value is valid
    }
  }

  // cross-field: finish after start (only when both parse cleanly)
  const s = parseClockTime(answers['start'] ?? '');
  const e = parseClockTime(answers['end'] ?? '');
  if (s && e && e.h * 60 + e.m <= s.h * 60 + s.m) errors['end'] = 'Finish must be after start';

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}
```

- [ ] **Step 7: Run — verify pass**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: PASS.

- [ ] **Step 8: Write the failing test — `packages/worklog-core/src/submit/submit-worklog.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { submitWorklog } from './submit-worklog.ts';
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';

const q = (o: Partial<Question>): Question => ({ order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...o });
const worker: Worker = { phone: '555', name: 'John', greeting: '', places: ['Warehouse'], active: true, token: 't' };
const questions = [q({ key: 'place', type: 'worker_places' }), q({ key: 'start', type: 'time' }), q({ key: 'end', type: 'time' })];
const now = new Date('2026-06-20T09:00:00Z');

test('valid submit appends a WorkLog row with hours', async () => {
  const g = createMemoryGateway({ WorkLogs: [['logged_at', 'phone', 'name', 'place', 'start', 'end', 'hours']] });
  const r = await submitWorklog(g, worker, questions, { place: 'Warehouse', start: '08:00', end: '16:30' }, 'Asia/Jerusalem', now);
  assert.deepEqual(r, { ok: true, hours: '8.5' });
  assert.deepEqual(g.dump().WorkLogs[1].slice(1), ['555', 'John', 'Warehouse', '08:00', '16:30', '8.5']);
});

test('invalid submit returns errors and writes nothing', async () => {
  const g = createMemoryGateway({ WorkLogs: [['logged_at', 'phone', 'name', 'place', 'start', 'end', 'hours']] });
  const r = await submitWorklog(g, worker, questions, { place: 'Nope', start: '08:00', end: '16:30' }, 'Asia/Jerusalem', now);
  assert.equal(r.ok, false);
  assert.equal(g.dump().WorkLogs.length, 1);
});
```

- [ ] **Step 9: Implement `packages/worklog-core/src/submit/submit-worklog.ts`**

```ts
import type { SheetsGateway } from '@scourage/sheets-helper';
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';
import { appendWorkLog } from '../data/worklogs.ts';
import { validateAnswers } from './validate-answers.ts';
import { buildWorklogRecord } from './build-record.ts';

export async function submitWorklog(
  gateway: SheetsGateway,
  worker: Worker,
  questions: Question[],
  answers: Record<string, string>,
  tz: string,
  now: Date,
): Promise<{ ok: true; hours: string | null } | { ok: false; errors: Record<string, string> }> {
  const v = validateAnswers(questions, answers, worker, tz, now);
  if (!v.ok) return v;
  const { record, keys } = buildWorklogRecord(worker, questions, answers, now);
  await appendWorkLog(gateway, record, keys);
  return { ok: true, hours: record['hours'] ?? null };
}
```

- [ ] **Step 10: Refactor the engine to use `buildWorklogRecord`**

In `packages/whatsapp-bot/src/conversation/engine.ts`, replace the manual record-building inside `finalize` (the block that creates `record`, loops over questions, and computes hours) with a call to the core helper. Add the import:
```ts
import { buildWorklogRecord } from '@scourage/worklog-core';
```
Replace the body of `finalize` from the `const record = {...}` through the hours computation with:
```ts
const { record, keys } = buildWorklogRecord(session.worker, session.questions, session.answers, deps.now());
```
Keep the rest of `finalize` (the `try { await appendWorkLog(deps.gateway, record, keys); } catch {...}` retry block and the `summary(...)` call) unchanged. Remove the now-unused local `keys` declaration if one existed and the now-unused `computeHours`/`parseClockTime` imports **only if** they are no longer referenced elsewhere in the file (the end-after-start guard near the top still uses them — keep those imports).

- [ ] **Step 11: Update `packages/worklog-core/src/index.ts`** — add:

```ts
export { buildWorklogRecord } from './submit/build-record.ts';
export { validateAnswers } from './submit/validate-answers.ts';
export { submitWorklog } from './submit/submit-worklog.ts';
```

- [ ] **Step 12: Run everything**

Run:
```bash
pnpm --filter @scourage/worklog-core test && pnpm --filter @scourage/worklog-core typecheck
pnpm --filter @scourage/whatsapp-bot test && pnpm --filter @scourage/whatsapp-bot typecheck
```
Expected: all PASS (engine tests still green — `buildWorklogRecord` produces identical output).

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(worklog-core): buildWorklogRecord + validateAnswers + submitWorklog; engine uses shared record builder"
```

---

### Task 4: worklog-core — token field + token utilities

**Files:**
- Create: `packages/worklog-core/src/data/tokens.ts`
- Test: `packages/worklog-core/src/data/tokens.test.ts`
- Modify: `packages/worklog-core/src/data/workers.ts` (add `token` to `Worker`; `findWorkerByToken`; shared `buildWorker`)
- Modify: `packages/worklog-core/src/data/workers.test.ts` (token column)
- Modify: `packages/worklog-core/src/index.ts`

**Interfaces:**
- Produces:
  - `Worker` gains `token: string`.
  - `generateToken(): string` — 24-char URL-safe random string.
  - `findWorkerByToken(gateway: SheetsGateway, token: string): Promise<Worker | null>` — matches the `token` column exactly (trimmed); applies the same active-places filtering as `findWorker`.

- [ ] **Step 1: Write the failing test — `packages/worklog-core/src/data/tokens.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateToken } from './tokens.ts';

test('generates distinct url-safe tokens', () => {
  const a = generateToken();
  const b = generateToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{20,}$/);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: FAIL — cannot find `./tokens.ts`.

- [ ] **Step 3: Implement `packages/worklog-core/src/data/tokens.ts`**

```ts
import { randomBytes } from 'node:crypto';

export function generateToken(): string {
  return randomBytes(18).toString('base64url');
}
```

- [ ] **Step 4: Add a token test to `packages/worklog-core/src/data/workers.test.ts`**

Append:
```ts
import { findWorkerByToken } from './workers.ts';

test('finds worker by token', async () => {
  const g = createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active', 'token'],
      ['15551230000', 'John', '', 'Warehouse', 'yes', 'abc123'],
    ],
  });
  const w = await findWorkerByToken(g, 'abc123');
  assert.equal(w?.name, 'John');
  assert.equal(w?.token, 'abc123');
  assert.equal(await findWorkerByToken(g, 'nope'), null);
  assert.equal(await findWorkerByToken(g, ''), null);
});
```
(`createMemoryGateway` is already imported at the top of this test file.)

- [ ] **Step 5: Run — verify the new test fails**

Run: `pnpm --filter @scourage/worklog-core test`
Expected: FAIL — `findWorkerByToken` not exported, `token` undefined.

- [ ] **Step 6: Modify `packages/worklog-core/src/data/workers.ts`**

Add `token` to the interface and extract a shared builder. Replace the file's `Worker` interface and `findWorker` with:

```ts
import { rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import { normalizePhone } from './phone.ts';
import { loadActivePlaces } from './places.ts';

export interface Worker {
  phone: string;
  name: string;
  greeting: string;
  places: string[];
  active: boolean;
  token: string;
}

async function buildWorker(gateway: SheetsGateway, row: Record<string, string>): Promise<Worker> {
  const workerPlaces = (row.places ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const master = await loadActivePlaces(gateway);
  const masterLower = master.map((m) => m.toLowerCase());
  const places = master.length === 0
    ? workerPlaces
    : workerPlaces.filter((p) => {
        const ok = masterLower.includes(p.toLowerCase());
        if (!ok) console.warn(`Worker ${normalizePhone(row.phone ?? '')}: place "${p}" not in active Places master — skipped`);
        return ok;
      });
  return {
    phone: normalizePhone(row.phone ?? ''),
    name: (row.name ?? '').trim(),
    greeting: (row.greeting ?? '').trim(),
    places,
    active: (row.active ?? '').trim().toLowerCase() !== 'no',
    token: (row.token ?? '').trim(),
  };
}

export async function findWorker(gateway: SheetsGateway, phone: string): Promise<Worker | null> {
  const target = normalizePhone(phone);
  const objs = rowsToObjects(await gateway.readTab('Workers'));
  const row = objs.find((o) => normalizePhone(o.phone ?? '') === target);
  return row ? buildWorker(gateway, row) : null;
}

export async function findWorkerByToken(gateway: SheetsGateway, token: string): Promise<Worker | null> {
  const t = (token ?? '').trim();
  if (!t) return null;
  const objs = rowsToObjects(await gateway.readTab('Workers'));
  const row = objs.find((o) => (o.token ?? '').trim() === t);
  return row ? buildWorker(gateway, row) : null;
}
```
(Keep `loadActivePlaces` defined in `places.ts`; this file imports it.)

- [ ] **Step 7: Update `packages/worklog-core/src/index.ts`** — add:

```ts
export { findWorkerByToken } from './data/workers.ts';
export { generateToken } from './data/tokens.ts';
```

- [ ] **Step 8: Run worklog-core + whatsapp-bot tests + typecheck**

Run:
```bash
pnpm --filter @scourage/worklog-core test && pnpm --filter @scourage/worklog-core typecheck
pnpm --filter @scourage/whatsapp-bot test && pnpm --filter @scourage/whatsapp-bot typecheck
```
Expected: all PASS. (The bot constructs `Worker` objects in its tests via the gateway, so the added `token` field defaults to `''` and breaks nothing; any bot test that builds a literal `Worker` object must add `token: 't'` — update those if typecheck flags them.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(worklog-core): worker token field + findWorkerByToken + generateToken"
```

---

### Task 5: web — Next.js scaffold + server-only Sheets gateway

**Files:**
- Create: `packages/web/package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`
- Create: `packages/web/app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Create: `packages/web/lib/sheets.ts`
- Create: `packages/web/.env.local.example`
- Create: `packages/web/app/api/health/route.ts`

**Interfaces:**
- Produces: a buildable Next.js app; `getGateway(): SheetsGateway` (server-only) and `COMPANY_TZ: string` from `lib/sheets.ts`.

- [ ] **Step 1: Create `packages/web/package.json`**

```json
{
  "name": "@scourage/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start",
    "test": "node --import tsx --test \"lib/**/*.test.ts\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scourage/sheets-helper": "workspace:*",
    "@scourage/worklog-core": "workspace:*",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "server-only": "^0.0.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create `packages/web/next.config.ts`**

```ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@scourage/sheets-helper', '@scourage/worklog-core'],
};

export default config;
```

- [ ] **Step 3: Create `packages/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create Tailwind config files**

`packages/web/postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```
`packages/web/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
export default config;
```

- [ ] **Step 5: Create the app shell**

`packages/web/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
`packages/web/app/layout.tsx`:
```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'FlowCat', description: 'Work hours logging' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
```
`packages/web/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">FlowCat</h1>
      <p className="mt-2 text-gray-600">Open your personal link to log your hours.</p>
    </main>
  );
}
```

- [ ] **Step 6: Create `packages/web/lib/sheets.ts`**

```ts
import 'server-only';
import { createGoogleGateway, parseServiceAccountJson, type SheetsGateway } from '@scourage/sheets-helper';

let cached: SheetsGateway | null = null;

export function getGateway(): SheetsGateway {
  if (cached) return cached;
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!json) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!spreadsheetId) throw new Error('Missing SHEETS_SPREADSHEET_ID');
  cached = createGoogleGateway({ credentials: parseServiceAccountJson(json), spreadsheetId });
  return cached;
}

export const COMPANY_TZ = process.env.COMPANY_TIMEZONE ?? 'UTC';
```

- [ ] **Step 7: Create `packages/web/app/api/health/route.ts`**

```ts
export function GET() {
  return Response.json({ ok: true });
}
```

- [ ] **Step 8: Create `packages/web/.env.local.example`**

```
GOOGLE_SERVICE_ACCOUNT_JSON={"client_email":"...","private_key":"..."}
SHEETS_SPREADSHEET_ID=1I2nwZ9kKUIywRiX0ofraTl5hgGz3Ej4W9eqn8HfN9O0
COMPANY_TIMEZONE=Asia/Jerusalem
```

- [ ] **Step 9: Install + build**

Run:
```bash
pnpm install
pnpm --filter @scourage/web build
```
Expected: Next build succeeds (compiles the workspace packages via `transpilePackages`). A warning about no env vars at build is fine — `getGateway()` is only called at request time.

- [ ] **Step 10: Commit**

```bash
git add -A packages/web pnpm-lock.yaml
git commit -m "feat(web): Next.js scaffold + server-only Sheets gateway"
```

---

### Task 6: web — Question → form-widget mapper

**Files:**
- Create: `packages/web/lib/form-widgets.ts`
- Test: `packages/web/lib/form-widgets.test.ts`

**Interfaces:**
- Consumes: `Question`, `Worker` from `@scourage/worklog-core`.
- Produces:
  - `type Widget = { key: string; label: string; required: boolean } & ({ kind: 'select'; options: string[] } | { kind: 'date' | 'time' | 'text' | 'number' })`
  - `questionToWidget(q: Question, worker: Worker): Widget`

- [ ] **Step 1: Write the failing test — `packages/web/lib/form-widgets.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionToWidget } from './form-widgets.ts';
import type { Question, Worker } from '@scourage/worklog-core';

const worker: Worker = { phone: '5', name: 'J', greeting: '', places: ['Warehouse', 'Office HQ'], active: true, token: 't' };
const q = (o: Partial<Question>): Question => ({ order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...o });

test('worker_places -> select of worker places', () => {
  assert.deepEqual(questionToWidget(q({ key: 'place', type: 'worker_places', text: 'Where?' }), worker),
    { key: 'place', label: 'Where?', required: true, kind: 'select', options: ['Warehouse', 'Office HQ'] });
});

test('choice -> select of options; date/time/number/text map by kind', () => {
  assert.equal(questionToWidget(q({ type: 'choice', options: ['a', 'b'] }), worker).kind, 'select');
  assert.equal(questionToWidget(q({ type: 'date' }), worker).kind, 'date');
  assert.equal(questionToWidget(q({ type: 'time' }), worker).kind, 'time');
  assert.equal(questionToWidget(q({ type: 'number' }), worker).kind, 'number');
  assert.equal(questionToWidget(q({ type: 'text' }), worker).kind, 'text');
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter @scourage/web test`
Expected: FAIL — cannot find `./form-widgets.ts`.

- [ ] **Step 3: Implement `packages/web/lib/form-widgets.ts`**

```ts
import type { Question, Worker } from '@scourage/worklog-core';

export type Widget =
  | { key: string; label: string; required: boolean; kind: 'select'; options: string[] }
  | { key: string; label: string; required: boolean; kind: 'date' | 'time' | 'text' | 'number' };

export function questionToWidget(q: Question, worker: Worker): Widget {
  const base = { key: q.key, label: q.text, required: q.required };
  switch (q.type) {
    case 'worker_places':
      return { ...base, kind: 'select', options: worker.places };
    case 'choice':
      return { ...base, kind: 'select', options: q.options };
    case 'date':
      return { ...base, kind: 'date' };
    case 'time':
      return { ...base, kind: 'time' };
    case 'number':
      return { ...base, kind: 'number' };
    default:
      return { ...base, kind: 'text' };
  }
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm --filter @scourage/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/lib/form-widgets.ts packages/web/lib/form-widgets.test.ts
git commit -m "feat(web): Question -> form-widget mapper"
```

---

### Task 7: web — worker form page `/w/[token]`

**Files:**
- Create: `packages/web/app/w/[token]/page.tsx`
- Create: `packages/web/app/w/[token]/worker-form.tsx`

**Interfaces:**
- Consumes: `getGateway`, `COMPANY_TZ` (lib/sheets); `findWorkerByToken`, `loadQuestions`, `validateQuestions`, `todayISO` (worklog-core); `questionToWidget` (lib/form-widgets).
- Produces: the worker-facing page. The client form `POST`s `{ token, answers }` to `/api/submit` (built in Task 8).

- [ ] **Step 1: Create the server page `packages/web/app/w/[token]/page.tsx`**

```tsx
import { getGateway, COMPANY_TZ } from '../../../lib/sheets';
import { findWorkerByToken, loadQuestions, validateQuestions, todayISO } from '@scourage/worklog-core';
import { questionToWidget } from '../../../lib/form-widgets';
import { WorkerForm } from './worker-form';

export const dynamic = 'force-dynamic';

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-gray-600">{body}</p>
    </main>
  );
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gw = getGateway();

  const worker = await findWorkerByToken(gw, token);
  if (!worker || !worker.active) {
    return <Notice title="This link isn’t valid" body="Please ask your manager for your link." />;
  }

  const questions = await loadQuestions(gw);
  const valid = validateQuestions(questions);
  if (!valid.ok) {
    return <Notice title="Not set up yet" body="Please ask your manager." />;
  }
  if (worker.places.length === 0) {
    return <Notice title="No work sites assigned" body="Please ask your manager." />;
  }

  const widgets = questions.map((q) => questionToWidget(q, worker));
  const greeting = worker.greeting || `Hi ${worker.name}!`;
  return <WorkerForm token={token} greeting={greeting} widgets={widgets} today={todayISO(COMPANY_TZ)} />;
}
```

- [ ] **Step 2: Create the client form `packages/web/app/w/[token]/worker-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { Widget } from '../../../lib/form-widgets';

type Props = { token: string; greeting: string; widgets: Widget[]; today: string };

export function WorkerForm({ token, greeting, widgets, today }: Props) {
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
        body: JSON.stringify({ token, answers }),
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
      <main className="mx-auto max-w-md p-6 text-center">
        <div className="text-4xl">✅</div>
        <h1 className="mt-3 text-xl font-semibold">Logged{hours ? ` ${hours}h` : ''}</h1>
        <button className="mt-6 rounded-lg bg-gray-900 px-4 py-2 text-white" onClick={() => { setAnswers(initial); setStatus('idle'); }}>
          Log another
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">{greeting}</h1>
      <form className="mt-6 space-y-5" onSubmit={submit}>
        {widgets.map((w) => (
          <div key={w.key}>
            <label className="block text-sm font-medium text-gray-700">
              {w.label}{!w.required && <span className="text-gray-400"> (optional)</span>}
            </label>
            {w.kind === 'select' ? (
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
                value={answers[w.key]}
                onChange={(e) => set(w.key, e.target.value)}
              >
                <option value="">Choose…</option>
                {w.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
                type={w.kind === 'date' ? 'date' : w.kind === 'time' ? 'time' : w.kind === 'number' ? 'number' : 'text'}
                value={answers[w.key]}
                max={w.kind === 'date' ? today : undefined}
                onChange={(e) => set(w.key, e.target.value)}
              />
            )}
            {errors[w.key] && <p className="mt-1 text-sm text-red-600">{errors[w.key]}</p>}
          </div>
        ))}
        {fatal && <p className="text-sm text-red-600">{fatal}</p>}
        <button
          type="submit"
          disabled={status === 'saving'}
          className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : 'Submit'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`
Expected: PASS (the page/form compile; `/api/submit` is added next — the form only references it at runtime).

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/w
git commit -m "feat(web): worker form page /w/[token]"
```

---

### Task 8: web — submit Route Handler `/api/submit`

**Files:**
- Create: `packages/web/app/api/submit/route.ts`

**Interfaces:**
- Consumes: `getGateway`, `COMPANY_TZ`; `findWorkerByToken`, `loadQuestions`, `validateQuestions`, `submitWorklog` (worklog-core).
- Produces: `POST /api/submit` accepting `{ token: string, answers: Record<string,string> }`; returns `{ ok: true, hours }` (200), `{ errors }` (400), or an error status.

- [ ] **Step 1: Implement `packages/web/app/api/submit/route.ts`**

```ts
import { getGateway, COMPANY_TZ } from '../../../lib/sheets';
import { findWorkerByToken, loadQuestions, validateQuestions, submitWorklog } from '@scourage/worklog-core';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const { token, answers } = (body ?? {}) as { token?: unknown; answers?: unknown };
  if (typeof token !== 'string' || typeof answers !== 'object' || answers === null) {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }

  const gw = getGateway();
  const worker = await findWorkerByToken(gw, token);
  if (!worker || !worker.active) {
    return Response.json({ error: 'invalid link' }, { status: 404 });
  }

  const questions = await loadQuestions(gw);
  const valid = validateQuestions(questions);
  if (!valid.ok) {
    return Response.json({ error: 'not set up' }, { status: 503 });
  }

  try {
    const result = await submitWorklog(gw, worker, questions, answers as Record<string, string>, COMPANY_TZ, new Date());
    if (!result.ok) return Response.json({ errors: result.errors }, { status: 400 });
    return Response.json({ ok: true, hours: result.hours });
  } catch (err) {
    console.error('submit failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`
Expected: PASS.

- [ ] **Step 3: Manual local smoke (optional — needs `.env.local` + the test sheet)**

Copy `.env.local.example` → `packages/web/.env.local`, fill `GOOGLE_SERVICE_ACCOUNT_JSON` (single-line JSON of the key) + `SHEETS_SPREADSHEET_ID`. Ensure the test sheet's `Workers` row has a `token` (Task 9 sets one). Then:
```bash
pnpm --filter @scourage/web dev
# open http://localhost:3001/w/<token>, submit, watch the WorkLogs row appear
```
Do not block the commit on this if creds aren't handy — the logic is unit-tested in worklog-core.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/api/submit
git commit -m "feat(web): /api/submit Route Handler (server-side validation + append)"
```

---

### Task 9: web — token seeding helper + deploy docs

**Files:**
- Modify: `packages/whatsapp-bot/scripts/add-worker.ts` (set a token)
- Create: `packages/web/README.md`
- Modify: root `README.md` (point at the web app)

**Interfaces:**
- Produces: the add-worker script now writes a `token`; docs for local run + Vercel deploy.

- [ ] **Step 1: Update `packages/whatsapp-bot/scripts/add-worker.ts` to set a token**

Replace its body with:
```ts
// Operator helper: append a worker row (with a generated magic-link token).
//   node --env-file=packages/whatsapp-bot/.env --import tsx \
//     packages/whatsapp-bot/scripts/add-worker.ts <phone> <name> [places]
import { createGoogleGateway } from '@scourage/sheets-helper';
import { generateToken } from '@scourage/worklog-core';
import { loadConfig } from '../src/config.ts';

const [, , phone, name = 'Worker', places = 'Main Warehouse, Office HQ'] = process.argv;
if (!phone) {
  console.error('Usage: add-worker.ts <phone> <name> [places]');
  process.exit(1);
}

const config = loadConfig(process.env);
const gw = createGoogleGateway({ keyFilePath: config.keyFilePath, spreadsheetId: config.spreadsheetId });
const token = generateToken();
await gw.appendRow('Workers', [phone, name, `Welcome back, ${name}!`, places, 'yes', token]);
console.log(`Added worker ${phone} (${name}); link token: ${token}`);
```
(The `Workers` header must include the `token` column — Task 4 expects it. If your test sheet's `Workers` header lacks `token`, add it as the 6th column once.)

- [ ] **Step 2: Create `packages/web/README.md`**

```markdown
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
```

- [ ] **Step 3: Append a Web section to root `README.md`**

Add:
```markdown
## packages/web — FlowCat web form (Vercel)
The worker form (`/w/<token>`) renders from the `Questions` tab and writes to `WorkLogs`.
See `packages/web/README.md`. Admin UI is Plan B.
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
git commit -m "chore(web): token-seeding helper + deploy docs"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage (Plan A portion):** inline-creds gateway (Task 1); worklog-core extraction + parked bot still builds (Task 2); submit path + DRY engine (Task 3); magic-link token model (Task 4); Next.js scaffold + server-only Sheets (Task 5); Questions→widget (Task 6); `/w/[token]` form rendered from Questions with native pickers (Task 7); server-side re-validation on submit (Task 8); deploy config + token seeding (Task 9). **Admin (NextAuth, workers/links UI, logs export, places, questions editor) is Plan B — intentionally not here.**
- **Type consistency:** `Worker` gains `token` in Task 4 and is used with `token` in Tasks 5–8; `Widget` defined in Task 6 is consumed in Task 7; `submitWorklog`/`validateAnswers`/`buildWorklogRecord` signatures defined in Task 3 are used unchanged in Task 8.
- **Server-only boundary:** `lib/sheets.ts` is `import 'server-only'`; only server components / route handlers import it. The client form talks to the server via `fetch('/api/submit')`.
- **Known follow-ups:** React components are manually verified (no component unit tests in v1); an optional Playwright happy-path can be added later.
