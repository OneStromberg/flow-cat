# WhatsApp Work-Log Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A WhatsApp bot where registered workers log work (place, date, start/finish times) into a Google Sheet, with the conversation flow defined by an admin-editable `Questions` tab.

**Architecture:** A reply-only webhook server. Two seams keep it testable offline: a `WhatsAppClient` interface (real Cloud API vs. console) and a normalized `InboundMessage` consumed by a data-driven conversation engine that walks questions loaded from the `Questions` tab. Google Sheets sits behind a small `SheetsGateway` interface (real Google impl + in-memory fake).

**Tech Stack:** Node.js 25 + TypeScript, pnpm workspace, `googleapis` (only runtime dep), `tsx` (run TS, no build step), Node's built-in test runner (`node:test`), native `node:http`, native `--env-file`.

## Global Constraints

- **Runtime:** Node.js ≥ 22 (developed on v25.2.1). `"type": "module"` everywhere (ESM).
- **Package manager:** `pnpm` only (workspace). Never `npm`/`yarn`.
- **No build step:** run TS directly via `tsx`. Tests via `node --import tsx --test`.
- **Minimal deps:** only `googleapis` at runtime. Dev: `typescript`, `tsx`, `@types/node`. Do not add web frameworks, date libs, or test frameworks.
- **Secrets:** only from env (loaded via `node --env-file=.env`). Never commit `.env` or service-account keys. `.env` and `*.key.json` are gitignored.
- **Nothing pushed to git** until the whole bot runs and tests pass locally. Commits are local only; do not run `git push`.
- **Workspace package names:** `@scourage/sheets-helper`, `@scourage/whatsapp-bot`.
- **TZ correctness:** all "today/yesterday" and typed-date logic uses the configured `COMPANY_TIMEZONE` (IANA name).

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Produces: a pnpm workspace with two empty packages installable via `pnpm install`.

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "slavery-courage",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
.env
*.key.json
*.local
dist/
```

- [ ] **Step 5: Create `.env.example`**

```
# WhatsApp transport: "console" (local) or "cloud" (real Meta API)
WHATSAPP_TRANSPORT=console

# Google Sheets
SHEETS_SPREADSHEET_ID=your-test-spreadsheet-id
GOOGLE_APPLICATION_CREDENTIALS=./service-account.key.json

# Company timezone (IANA name), drives today/yesterday + date parsing
COMPANY_TIMEZONE=Asia/Jerusalem

# Local REPL: which worker phone to simulate
LOCAL_WORKER_PHONE=15551230000

# Cloud API (only needed when WHATSAPP_TRANSPORT=cloud)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=
PORT=3000
```

- [ ] **Step 6: Create the two package directories and install**

Run:
```bash
mkdir -p packages/sheets-helper/src packages/whatsapp-bot/src
```
(The package manifests are added in Tasks 2 and 4; install runs there.)

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example
git commit -m "chore: scaffold pnpm monorepo"
```

---

### Task 2: sheets-helper — pure row helpers

**Files:**
- Create: `packages/sheets-helper/package.json`
- Create: `packages/sheets-helper/tsconfig.json`
- Create: `packages/sheets-helper/src/rows.ts`
- Test: `packages/sheets-helper/src/rows.test.ts`

**Interfaces:**
- Produces:
  - `rowsToObjects(rows: string[][]): Record<string, string>[]` — row 0 is headers; pads ragged rows; skips blank header columns.
  - `objectToRow(obj: Record<string, string>, headers: string[]): string[]` — aligns an object to a header order, missing keys → `''`.

- [ ] **Step 1: Create `packages/sheets-helper/package.json`**

```json
{
  "name": "@scourage/sheets-helper",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "node --import tsx --test \"src/**/*.test.ts\"",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "googleapis": "^144.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/sheets-helper/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write the failing test — `packages/sheets-helper/src/rows.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsToObjects, objectToRow } from './rows.ts';

test('rowsToObjects maps headers and pads ragged rows', () => {
  const rows = [
    ['phone', 'name', 'active'],
    ['555', 'John', 'yes'],
    ['556', 'Maria'], // ragged: missing active
  ];
  assert.deepEqual(rowsToObjects(rows), [
    { phone: '555', name: 'John', active: 'yes' },
    { phone: '556', name: 'Maria', active: '' },
  ]);
});

test('rowsToObjects returns [] for empty input', () => {
  assert.deepEqual(rowsToObjects([]), []);
});

test('objectToRow aligns to header order, missing keys blank', () => {
  assert.deepEqual(
    objectToRow({ name: 'John', phone: '555' }, ['phone', 'name', 'hours']),
    ['555', 'John', ''],
  );
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @scourage/sheets-helper test`
Expected: FAIL — cannot find module `./rows.ts`.

- [ ] **Step 5: Implement `packages/sheets-helper/src/rows.ts`**

```ts
export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => (h ?? '').toString().trim());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) o[h] = (r[i] ?? '').toString();
    });
    return o;
  });
}

export function objectToRow(obj: Record<string, string>, headers: string[]): string[] {
  return headers.map((h) => obj[h] ?? '');
}
```

- [ ] **Step 6: Run tests — verify pass**

Run: `pnpm install && pnpm --filter @scourage/sheets-helper test`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/sheets-helper pnpm-lock.yaml
git commit -m "feat(sheets-helper): pure row<->object helpers"
```

---

### Task 3: sheets-helper — SheetsGateway interface, memory + Google impls

**Files:**
- Create: `packages/sheets-helper/src/gateway.ts`
- Create: `packages/sheets-helper/src/memory-gateway.ts`
- Create: `packages/sheets-helper/src/google-gateway.ts`
- Create: `packages/sheets-helper/src/index.ts`
- Test: `packages/sheets-helper/src/memory-gateway.test.ts`

**Interfaces:**
- Consumes: `rows.ts` (Task 2).
- Produces:
  - `interface SheetsGateway { readTab(tab: string): Promise<string[][]>; writeHeaderRow(tab: string, headers: string[]): Promise<void>; appendRow(tab: string, row: string[]): Promise<void>; }`
  - `createMemoryGateway(initial?: Record<string, string[][]>): SheetsGateway & { dump(): Record<string, string[][]> }`
  - `createGoogleGateway(opts: { keyFilePath: string; spreadsheetId: string }): SheetsGateway`
  - `index.ts` re-exports everything above plus `rowsToObjects`, `objectToRow`.

- [ ] **Step 1: Create `packages/sheets-helper/src/gateway.ts`**

```ts
export interface SheetsGateway {
  /** Returns all rows of a tab; row 0 is the header row. */
  readTab(tab: string): Promise<string[][]>;
  /** Overwrites row 1 (the header row) of a tab. */
  writeHeaderRow(tab: string, headers: string[]): Promise<void>;
  /** Appends a single row to the bottom of a tab. */
  appendRow(tab: string, row: string[]): Promise<void>;
}
```

- [ ] **Step 2: Write the failing test — `packages/sheets-helper/src/memory-gateway.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from './memory-gateway.ts';

test('memory gateway reads seeded tabs', async () => {
  const g = createMemoryGateway({ Places: [['place_name'], ['Warehouse']] });
  assert.deepEqual(await g.readTab('Places'), [['place_name'], ['Warehouse']]);
  assert.deepEqual(await g.readTab('Missing'), []);
});

test('memory gateway appends rows and writes header', async () => {
  const g = createMemoryGateway({ WorkLogs: [['phone']] });
  await g.writeHeaderRow('WorkLogs', ['phone', 'name']);
  await g.appendRow('WorkLogs', ['555', 'John']);
  assert.deepEqual(g.dump().WorkLogs, [['phone', 'name'], ['555', 'John']]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @scourage/sheets-helper test`
Expected: FAIL — cannot find `./memory-gateway.ts`.

- [ ] **Step 4: Implement `packages/sheets-helper/src/memory-gateway.ts`**

```ts
import type { SheetsGateway } from './gateway.ts';

export function createMemoryGateway(
  initial: Record<string, string[][]> = {},
): SheetsGateway & { dump(): Record<string, string[][]> } {
  const tabs: Record<string, string[][]> = structuredClone(initial);
  return {
    async readTab(tab) {
      return tabs[tab] ?? [];
    },
    async writeHeaderRow(tab, headers) {
      const t = (tabs[tab] ??= []);
      t[0] = [...headers];
    },
    async appendRow(tab, row) {
      (tabs[tab] ??= []).push([...row]);
    },
    dump() {
      return tabs;
    },
  };
}
```

- [ ] **Step 5: Implement `packages/sheets-helper/src/google-gateway.ts`**

```ts
import { google } from 'googleapis';
import type { SheetsGateway } from './gateway.ts';

export function createGoogleGateway(opts: {
  keyFilePath: string;
  spreadsheetId: string;
}): SheetsGateway {
  const auth = new google.auth.GoogleAuth({
    keyFile: opts.keyFilePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
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

- [ ] **Step 6: Implement `packages/sheets-helper/src/index.ts`**

```ts
export type { SheetsGateway } from './gateway.ts';
export { rowsToObjects, objectToRow } from './rows.ts';
export { createMemoryGateway } from './memory-gateway.ts';
export { createGoogleGateway } from './google-gateway.ts';
```

- [ ] **Step 7: Run tests + typecheck — verify pass**

Run: `pnpm --filter @scourage/sheets-helper test && pnpm --filter @scourage/sheets-helper typecheck`
Expected: PASS (4 tests), typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add packages/sheets-helper pnpm-lock.yaml
git commit -m "feat(sheets-helper): SheetsGateway with memory + google impls"
```

---

### Task 4: whatsapp-bot — package scaffold + config loader

**Files:**
- Create: `packages/whatsapp-bot/package.json`
- Create: `packages/whatsapp-bot/tsconfig.json`
- Create: `packages/whatsapp-bot/src/config.ts`
- Test: `packages/whatsapp-bot/src/config.test.ts`

**Interfaces:**
- Produces:
  - `interface Config { transport: 'console' | 'cloud'; spreadsheetId: string; keyFilePath: string; timezone: string; localWorkerPhone: string; whatsappToken: string; whatsappPhoneNumberId: string; metaAppSecret: string; metaVerifyToken: string; port: number; }`
  - `loadConfig(env: NodeJS.ProcessEnv): Config` — throws `Error` listing every missing required var. In `console` transport the cloud vars are optional; in `cloud` transport they are required.

- [ ] **Step 1: Create `packages/whatsapp-bot/package.json`**

```json
{
  "name": "@scourage/whatsapp-bot",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev:local": "node --env-file=.env --import tsx src/local/repl.ts",
    "dev": "node --env-file=.env --import tsx src/server.ts",
    "test": "node --import tsx --test \"src/**/*.test.ts\"",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@scourage/sheets-helper": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/whatsapp-bot/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write the failing test — `packages/whatsapp-bot/src/config.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.ts';

const base = {
  WHATSAPP_TRANSPORT: 'console',
  SHEETS_SPREADSHEET_ID: 'sheet1',
  GOOGLE_APPLICATION_CREDENTIALS: './k.json',
  COMPANY_TIMEZONE: 'Asia/Jerusalem',
  LOCAL_WORKER_PHONE: '15551230000',
};

test('loads console config without cloud vars', () => {
  const c = loadConfig({ ...base });
  assert.equal(c.transport, 'console');
  assert.equal(c.spreadsheetId, 'sheet1');
  assert.equal(c.timezone, 'Asia/Jerusalem');
});

test('throws when a required var is missing', () => {
  const { SHEETS_SPREADSHEET_ID, ...rest } = base;
  assert.throws(() => loadConfig(rest), /SHEETS_SPREADSHEET_ID/);
});

test('cloud transport requires cloud vars', () => {
  assert.throws(
    () => loadConfig({ ...base, WHATSAPP_TRANSPORT: 'cloud' }),
    /WHATSAPP_TOKEN/,
  );
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: FAIL — cannot find `./config.ts`.

- [ ] **Step 5: Implement `packages/whatsapp-bot/src/config.ts`**

```ts
export interface Config {
  transport: 'console' | 'cloud';
  spreadsheetId: string;
  keyFilePath: string;
  timezone: string;
  localWorkerPhone: string;
  whatsappToken: string;
  whatsappPhoneNumberId: string;
  metaAppSecret: string;
  metaVerifyToken: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const errors: string[] = [];
  const req = (name: string): string => {
    const v = (env[name] ?? '').trim();
    if (!v) errors.push(name);
    return v;
  };

  const transport = (env.WHATSAPP_TRANSPORT ?? 'console').trim() === 'cloud' ? 'cloud' : 'console';
  const spreadsheetId = req('SHEETS_SPREADSHEET_ID');
  const keyFilePath = req('GOOGLE_APPLICATION_CREDENTIALS');
  const timezone = req('COMPANY_TIMEZONE');
  const localWorkerPhone = (env.LOCAL_WORKER_PHONE ?? '').trim();

  let whatsappToken = (env.WHATSAPP_TOKEN ?? '').trim();
  let whatsappPhoneNumberId = (env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim();
  let metaAppSecret = (env.META_APP_SECRET ?? '').trim();
  let metaVerifyToken = (env.META_VERIFY_TOKEN ?? '').trim();

  if (transport === 'cloud') {
    whatsappToken = req('WHATSAPP_TOKEN');
    whatsappPhoneNumberId = req('WHATSAPP_PHONE_NUMBER_ID');
    metaAppSecret = req('META_APP_SECRET');
    metaVerifyToken = req('META_VERIFY_TOKEN');
  }

  if (errors.length) {
    throw new Error(`Missing required env vars: ${errors.join(', ')}`);
  }

  return {
    transport,
    spreadsheetId,
    keyFilePath,
    timezone,
    localWorkerPhone,
    whatsappToken,
    whatsappPhoneNumberId,
    metaAppSecret,
    metaVerifyToken,
    port: Number(env.PORT ?? '3000') || 3000,
  };
}
```

- [ ] **Step 6: Run tests — verify pass**

Run: `pnpm install && pnpm --filter @scourage/whatsapp-bot test`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/whatsapp-bot pnpm-lock.yaml
git commit -m "feat(bot): package scaffold + env config loader"
```

---

### Task 5: Phone normalization

**Files:**
- Create: `packages/whatsapp-bot/src/data/phone.ts`
- Test: `packages/whatsapp-bot/src/data/phone.test.ts`

**Interfaces:**
- Produces: `normalizePhone(s: string): string` — strips everything except digits; drops a single leading `00` international prefix; returns digits only.

- [ ] **Step 1: Write the failing test — `packages/whatsapp-bot/src/data/phone.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './phone.ts';

test('strips formatting to digits', () => {
  assert.equal(normalizePhone('+1 (555) 123-0000'), '15551230000');
  assert.equal(normalizePhone('  972-54-555-1234 '), '972545551234');
});

test('drops a leading 00 international prefix', () => {
  assert.equal(normalizePhone('0049 151 23456'), '4915123456');
});

test('empty stays empty', () => {
  assert.equal(normalizePhone(''), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: FAIL — cannot find `./phone.ts`.

- [ ] **Step 3: Implement `packages/whatsapp-bot/src/data/phone.ts`**

```ts
export function normalizePhone(s: string): string {
  let digits = (s ?? '').replace(/\D+/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits;
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/whatsapp-bot/src/data/phone.ts packages/whatsapp-bot/src/data/phone.test.ts
git commit -m "feat(bot): phone normalization"
```

---

### Task 6: Time parsing + hours computation

**Files:**
- Create: `packages/whatsapp-bot/src/time/clock.ts`
- Test: `packages/whatsapp-bot/src/time/clock.test.ts`

**Interfaces:**
- Produces:
  - `parseClockTime(s: string): { h: number; m: number } | null` — accepts `H:MM`/`HH:MM`, 24h; rejects out-of-range.
  - `computeHours(start: { h: number; m: number }, end: { h: number; m: number }): number | null` — returns hours rounded to 2dp, or `null` if `end <= start`.

- [ ] **Step 1: Write the failing test — `packages/whatsapp-bot/src/time/clock.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClockTime, computeHours } from './clock.ts';

test('parses valid 24h times', () => {
  assert.deepEqual(parseClockTime('08:00'), { h: 8, m: 0 });
  assert.deepEqual(parseClockTime('9:30'), { h: 9, m: 30 });
  assert.deepEqual(parseClockTime('23:59'), { h: 23, m: 59 });
});

test('rejects bad times', () => {
  assert.equal(parseClockTime('24:00'), null);
  assert.equal(parseClockTime('8'), null);
  assert.equal(parseClockTime('8:60'), null);
  assert.equal(parseClockTime('abc'), null);
});

test('computes hours and rejects non-positive spans', () => {
  assert.equal(computeHours({ h: 8, m: 0 }, { h: 16, m: 30 }), 8.5);
  assert.equal(computeHours({ h: 9, m: 0 }, { h: 9, m: 0 }), null);
  assert.equal(computeHours({ h: 17, m: 0 }, { h: 9, m: 0 }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: FAIL — cannot find `./clock.ts`.

- [ ] **Step 3: Implement `packages/whatsapp-bot/src/time/clock.ts`**

```ts
export function parseClockTime(s: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

export function computeHours(
  start: { h: number; m: number },
  end: { h: number; m: number },
): number | null {
  const mins = (end.h * 60 + end.m) - (start.h * 60 + start.m);
  if (mins <= 0) return null;
  return Math.round((mins / 60) * 100) / 100;
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/whatsapp-bot/src/time/clock.ts packages/whatsapp-bot/src/time/clock.test.ts
git commit -m "feat(bot): clock-time parsing + hours computation"
```

---

### Task 7: Date resolution in company timezone

**Files:**
- Create: `packages/whatsapp-bot/src/time/dates.ts`
- Test: `packages/whatsapp-bot/src/time/dates.test.ts`

**Interfaces:**
- Produces:
  - `todayISO(tz: string, now?: Date): string` — `YYYY-MM-DD` for the date in `tz`.
  - `yesterdayISO(tz: string, now?: Date): string`.
  - `resolveTypedDate(s: string, tz: string, now?: Date): { ok: true; iso: string } | { ok: false; reason: 'invalid' | 'future' }` — parses `DD/MM/YYYY`; rejects malformed and future dates.

- [ ] **Step 1: Write the failing test — `packages/whatsapp-bot/src/time/dates.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayISO, yesterdayISO, resolveTypedDate } from './dates.ts';

const now = new Date('2026-06-20T09:00:00Z'); // fixed clock
const tz = 'Asia/Jerusalem';

test('today/yesterday in tz', () => {
  assert.equal(todayISO(tz, now), '2026-06-20');
  assert.equal(yesterdayISO(tz, now), '2026-06-19');
});

test('resolveTypedDate parses DD/MM/YYYY', () => {
  assert.deepEqual(resolveTypedDate('19/06/2026', tz, now), { ok: true, iso: '2026-06-19' });
});

test('rejects malformed dates', () => {
  assert.deepEqual(resolveTypedDate('2026-06-19', tz, now), { ok: false, reason: 'invalid' });
  assert.deepEqual(resolveTypedDate('45/13/2026', tz, now), { ok: false, reason: 'invalid' });
});

test('rejects future dates', () => {
  assert.deepEqual(resolveTypedDate('25/06/2026', tz, now), { ok: false, reason: 'future' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: FAIL — cannot find `./dates.ts`.

- [ ] **Step 3: Implement `packages/whatsapp-bot/src/time/dates.ts`**

```ts
function isoInTz(d: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function todayISO(tz: string, now: Date = new Date()): string {
  return isoInTz(now, tz);
}

export function yesterdayISO(tz: string, now: Date = new Date()): string {
  return isoInTz(new Date(now.getTime() - 86_400_000), tz);
}

export function resolveTypedDate(
  s: string,
  tz: string,
  now: Date = new Date(),
): { ok: true; iso: string } | { ok: false; reason: 'invalid' | 'future' } {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s ?? '').trim());
  if (!m) return { ok: false, reason: 'invalid' };
  const day = Number(m[1]);
  const mon = Number(m[2]);
  const yr = Number(m[3]);
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return { ok: false, reason: 'invalid' };
  const iso = `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return { ok: false, reason: 'invalid' };
  // round-trip guard catches overflow like 31/02
  if (isoInTz(dt, 'UTC') !== iso) return { ok: false, reason: 'invalid' };
  if (iso > todayISO(tz, now)) return { ok: false, reason: 'future' };
  return { ok: true, iso };
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/whatsapp-bot/src/time/dates.ts packages/whatsapp-bot/src/time/dates.test.ts
git commit -m "feat(bot): timezone-aware date resolution"
```

---

### Task 8: Question types + loader

**Files:**
- Create: `packages/whatsapp-bot/src/questions/types.ts`
- Create: `packages/whatsapp-bot/src/questions/load-questions.ts`
- Test: `packages/whatsapp-bot/src/questions/load-questions.test.ts`

**Interfaces:**
- Consumes: `@scourage/sheets-helper` (`SheetsGateway`, `rowsToObjects`).
- Produces:
  - `type QuestionType = 'worker_places' | 'date' | 'time' | 'choice' | 'text' | 'number'`
  - `interface Question { order: number; key: string; type: QuestionType; text: string; options: string[]; required: boolean; }`
  - `loadQuestions(gateway: SheetsGateway): Promise<Question[]>` — reads the `Questions` tab, skips rows with empty `key`, parses `options` (comma-split), `required` defaults true (only literal `no` → false), sorts by `order` ascending (non-numeric orders sink to the end).

- [ ] **Step 1: Create `packages/whatsapp-bot/src/questions/types.ts`**

```ts
export type QuestionType =
  | 'worker_places'
  | 'date'
  | 'time'
  | 'choice'
  | 'text'
  | 'number';

export interface Question {
  order: number;
  key: string;
  type: QuestionType;
  text: string;
  options: string[];
  required: boolean;
}
```

- [ ] **Step 2: Write the failing test — `packages/whatsapp-bot/src/questions/load-questions.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { loadQuestions } from './load-questions.ts';

test('loads, parses, and sorts questions', async () => {
  const g = createMemoryGateway({
    Questions: [
      ['order', 'key', 'type', 'text', 'options', 'required'],
      ['2', 'date', 'date', 'Which day?', '', ''],
      ['1', 'place', 'worker_places', 'Where?', '', 'yes'],
      ['3', 'crew', 'choice', 'Crew size?', '1, 2, 3', 'no'],
      ['', '', '', 'blank row ignored', '', ''],
    ],
  });
  const qs = await loadQuestions(g);
  assert.deepEqual(qs.map((q) => q.key), ['place', 'date', 'crew']);
  assert.deepEqual(qs[2].options, ['1', '2', '3']);
  assert.equal(qs[0].required, true);
  assert.equal(qs[2].required, false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: FAIL — cannot find `./load-questions.ts`.

- [ ] **Step 4: Implement `packages/whatsapp-bot/src/questions/load-questions.ts`**

```ts
import { rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import type { Question, QuestionType } from './types.ts';

export async function loadQuestions(gateway: SheetsGateway): Promise<Question[]> {
  const rows = await gateway.readTab('Questions');
  const objs = rowsToObjects(rows);
  const qs: Question[] = objs
    .filter((o) => (o.key ?? '').trim() !== '')
    .map((o) => ({
      order: Number(o.order),
      key: o.key.trim(),
      type: (o.type ?? '').trim() as QuestionType,
      text: (o.text ?? '').trim(),
      options: (o.options ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      required: (o.required ?? '').trim().toLowerCase() !== 'no',
    }));
  return qs.sort((a, b) => {
    const ao = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
    return ao - bo;
  });
}
```

- [ ] **Step 5: Run tests — verify pass**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/whatsapp-bot/src/questions/types.ts packages/whatsapp-bot/src/questions/load-questions.ts packages/whatsapp-bot/src/questions/load-questions.test.ts
git commit -m "feat(bot): question types + Questions-tab loader"
```

---

### Task 9: Questions config validation

**Files:**
- Create: `packages/whatsapp-bot/src/questions/validate-config.ts`
- Test: `packages/whatsapp-bot/src/questions/validate-config.test.ts`

**Interfaces:**
- Consumes: `Question`, `QuestionType` (Task 8).
- Produces: `validateQuestions(qs: Question[]): { ok: true } | { ok: false; errors: string[] }`. Errors: empty list, duplicate `key`, unknown `type`, `choice` with no options, missing `text`, `worker_places` count ≠ 1.

- [ ] **Step 1: Write the failing test — `packages/whatsapp-bot/src/questions/validate-config.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestions } from './validate-config.ts';
import type { Question } from './types.ts';

const q = (over: Partial<Question>): Question => ({
  order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...over,
});

test('valid config passes', () => {
  const r = validateQuestions([
    q({ key: 'place', type: 'worker_places', text: 'Where?' }),
    q({ key: 'start', type: 'time', text: 'Start?' }),
  ]);
  assert.deepEqual(r, { ok: true });
});

test('empty config fails', () => {
  assert.equal(validateQuestions([]).ok, false);
});

test('catches duplicate key, unknown type, empty choice, missing text', () => {
  const r = validateQuestions([
    q({ key: 'place', type: 'worker_places', text: 'Where?' }),
    q({ key: 'dup', type: 'text', text: 'A' }),
    q({ key: 'dup', type: 'nope' as never, text: '' }),
    q({ key: 'c', type: 'choice', text: 'C', options: [] }),
  ]);
  assert.equal(r.ok, false);
  if (!r.ok) {
    const blob = r.errors.join('|');
    assert.match(blob, /Duplicate key: dup/);
    assert.match(blob, /Unknown type "nope"/);
    assert.match(blob, /no options/);
    assert.match(blob, /no text/);
  }
});

test('requires exactly one worker_places', () => {
  assert.equal(validateQuestions([q({ key: 'a', type: 'text', text: 'A' })]).ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: FAIL — cannot find `./validate-config.ts`.

- [ ] **Step 3: Implement `packages/whatsapp-bot/src/questions/validate-config.ts`**

```ts
import type { Question, QuestionType } from './types.ts';

const TYPES: ReadonlySet<QuestionType> = new Set([
  'worker_places', 'date', 'time', 'choice', 'text', 'number',
]);

export function validateQuestions(
  qs: Question[],
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (qs.length === 0) errors.push('No questions defined.');

  const seen = new Set<string>();
  for (const q of qs) {
    if (seen.has(q.key)) errors.push(`Duplicate key: ${q.key}`);
    seen.add(q.key);
    if (!TYPES.has(q.type)) errors.push(`Unknown type "${q.type}" for key ${q.key}`);
    if (q.type === 'choice' && q.options.length === 0) {
      errors.push(`choice "${q.key}" has no options`);
    }
    if (!q.text) errors.push(`Question ${q.key} has no text`);
  }

  const placeCount = qs.filter((q) => q.type === 'worker_places').length;
  if (placeCount !== 1) {
    errors.push(`Expected exactly one worker_places question, found ${placeCount}.`);
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/whatsapp-bot/src/questions/validate-config.ts packages/whatsapp-bot/src/questions/validate-config.test.ts
git commit -m "feat(bot): Questions config validation"
```

---

### Task 10: WhatsApp message types, ConsoleClient, webhook parse + signature

**Files:**
- Create: `packages/whatsapp-bot/src/whatsapp/types.ts`
- Create: `packages/whatsapp-bot/src/whatsapp/console-client.ts`
- Create: `packages/whatsapp-bot/src/whatsapp/parse-webhook.ts`
- Create: `packages/whatsapp-bot/src/whatsapp/verify-signature.ts`
- Test: `packages/whatsapp-bot/src/whatsapp/parse-webhook.test.ts`
- Test: `packages/whatsapp-bot/src/whatsapp/verify-signature.test.ts`

**Interfaces:**
- Produces:
  - `interface InboundMessage { phone: string; text?: string; selectionId?: string; }`
  - `type OutboundMessage = { kind: 'text'; body: string } | { kind: 'buttons'; body: string; buttons: { id: string; title: string }[] } | { kind: 'list'; body: string; rows: { id: string; title: string }[] }`
  - `interface WhatsAppClient { send(to: string, msg: OutboundMessage): Promise<void>; }`
  - `createConsoleClient(write?: (line: string) => void): WhatsAppClient`
  - `parseWebhook(body: unknown): InboundMessage | null` — extracts the first message; reads `text.body`, or `interactive.button_reply.id` / `interactive.list_reply.id` as `selectionId`.
  - `verifySignature(rawBody: string, header: string | undefined, appSecret: string): boolean` — HMAC-SHA256, constant-time compare.

- [ ] **Step 1: Create `packages/whatsapp-bot/src/whatsapp/types.ts`**

```ts
export interface InboundMessage {
  phone: string;
  text?: string;
  selectionId?: string;
}

export type OutboundMessage =
  | { kind: 'text'; body: string }
  | { kind: 'buttons'; body: string; buttons: { id: string; title: string }[] }
  | { kind: 'list'; body: string; rows: { id: string; title: string }[] };

export interface WhatsAppClient {
  send(to: string, msg: OutboundMessage): Promise<void>;
}
```

- [ ] **Step 2: Create `packages/whatsapp-bot/src/whatsapp/console-client.ts`**

```ts
import type { OutboundMessage, WhatsAppClient } from './types.ts';

export function createConsoleClient(
  write: (line: string) => void = (l) => console.log(l),
): WhatsAppClient {
  return {
    async send(_to, msg) {
      if (msg.kind === 'text') {
        write(`bot> ${msg.body}`);
      } else if (msg.kind === 'buttons') {
        write(`bot> ${msg.body}`);
        write(msg.buttons.map((b, i) => `  [${i + 1}] ${b.title}`).join('   '));
      } else {
        write(`bot> ${msg.body}`);
        write(msg.rows.map((r, i) => `  ${i + 1}. ${r.title}`).join('\n'));
      }
    },
  };
}
```

- [ ] **Step 3: Write the failing test — `packages/whatsapp-bot/src/whatsapp/parse-webhook.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWebhook } from './parse-webhook.ts';

const wrap = (message: unknown) => ({
  entry: [{ changes: [{ value: { messages: [message] } }] }],
});

test('parses a text message', () => {
  const r = parseWebhook(wrap({ from: '15551230000', type: 'text', text: { body: 'hi' } }));
  assert.deepEqual(r, { phone: '15551230000', text: 'hi' });
});

test('parses an interactive list reply', () => {
  const r = parseWebhook(
    wrap({
      from: '15551230000',
      type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: 'opt_2', title: 'Office HQ' } },
    }),
  );
  assert.deepEqual(r, { phone: '15551230000', text: 'Office HQ', selectionId: 'opt_2' });
});

test('returns null for status/non-message payloads', () => {
  assert.equal(parseWebhook({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }), null);
  assert.equal(parseWebhook({}), null);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: FAIL — cannot find `./parse-webhook.ts`.

- [ ] **Step 5: Implement `packages/whatsapp-bot/src/whatsapp/parse-webhook.ts`**

```ts
import type { InboundMessage } from './types.ts';

export function parseWebhook(body: unknown): InboundMessage | null {
  const b = body as any;
  const msg = b?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || !msg.from) return null;

  if (msg.type === 'text' && msg.text?.body) {
    return { phone: String(msg.from), text: String(msg.text.body) };
  }

  if (msg.type === 'interactive') {
    const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
    if (reply?.id) {
      return {
        phone: String(msg.from),
        text: reply.title ? String(reply.title) : undefined,
        selectionId: String(reply.id),
      };
    }
  }

  return null;
}
```

- [ ] **Step 6: Write the failing test — `packages/whatsapp-bot/src/whatsapp/verify-signature.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySignature } from './verify-signature.ts';

const secret = 'app-secret';
const body = '{"hello":"world"}';
const good = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

test('accepts a correct signature', () => {
  assert.equal(verifySignature(body, good, secret), true);
});

test('rejects wrong/missing signatures', () => {
  assert.equal(verifySignature(body, 'sha256=deadbeef', secret), false);
  assert.equal(verifySignature(body, undefined, secret), false);
});
```

- [ ] **Step 7: Implement `packages/whatsapp-bot/src/whatsapp/verify-signature.ts`**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySignature(
  rawBody: string,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const got = header.slice('sha256='.length);
  const a = Buffer.from(got, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 8: Run tests — verify pass**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: PASS (parse + signature tests).

- [ ] **Step 9: Commit**

```bash
git add packages/whatsapp-bot/src/whatsapp
git commit -m "feat(bot): whatsapp types, console client, webhook parse + signature verify"
```

---

### Task 11: Data layer — workers, places, worklogs

**Files:**
- Create: `packages/whatsapp-bot/src/data/workers.ts`
- Create: `packages/whatsapp-bot/src/data/worklogs.ts`
- Test: `packages/whatsapp-bot/src/data/workers.test.ts`
- Test: `packages/whatsapp-bot/src/data/worklogs.test.ts`

**Interfaces:**
- Consumes: `SheetsGateway`, `rowsToObjects`, `objectToRow` (sheets-helper); `normalizePhone` (Task 5).
- Produces:
  - `interface Worker { phone: string; name: string; greeting: string; places: string[]; active: boolean; }`
  - `findWorker(gateway: SheetsGateway, phone: string): Promise<Worker | null>` — matches on normalized phone; `active` is false only when the cell is literally `no`.
  - `appendWorkLog(gateway: SheetsGateway, record: Record<string, string>, questionKeys: string[]): Promise<void>` — header-driven: ensures `WorkLogs` header contains `logged_at, phone, name, ...questionKeys, hours`, appending any missing columns; then appends the aligned row.

- [ ] **Step 1: Write the failing test — `packages/whatsapp-bot/src/data/workers.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { findWorker } from './workers.ts';

const gw = () =>
  createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active'],
      ['+1 555-123-0000', 'John', '', 'Warehouse, Office HQ', 'yes'],
      ['15559999999', 'Ghost', '', 'Site', 'no'],
    ],
  });

test('finds worker by normalized phone and parses places', async () => {
  const w = await findWorker(gw(), '15551230000');
  assert.equal(w?.name, 'John');
  assert.deepEqual(w?.places, ['Warehouse', 'Office HQ']);
  assert.equal(w?.active, true);
});

test('inactive worker marked active=false; unknown phone null', async () => {
  assert.equal((await findWorker(gw(), '15559999999'))?.active, false);
  assert.equal(await findWorker(gw(), '10000000000'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: FAIL — cannot find `./workers.ts`.

- [ ] **Step 3: Implement `packages/whatsapp-bot/src/data/workers.ts`**

```ts
import { rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import { normalizePhone } from './phone.ts';

export interface Worker {
  phone: string;
  name: string;
  greeting: string;
  places: string[];
  active: boolean;
}

export async function findWorker(
  gateway: SheetsGateway,
  phone: string,
): Promise<Worker | null> {
  const target = normalizePhone(phone);
  const objs = rowsToObjects(await gateway.readTab('Workers'));
  const row = objs.find((o) => normalizePhone(o.phone ?? '') === target);
  if (!row) return null;
  return {
    phone: target,
    name: (row.name ?? '').trim(),
    greeting: (row.greeting ?? '').trim(),
    places: (row.places ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    active: (row.active ?? '').trim().toLowerCase() !== 'no',
  };
}
```

- [ ] **Step 4: Write the failing test — `packages/whatsapp-bot/src/data/worklogs.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { appendWorkLog } from './worklogs.ts';

test('appends aligned to existing header', async () => {
  const g = createMemoryGateway({
    WorkLogs: [['logged_at', 'phone', 'name', 'place', 'date', 'start', 'end', 'hours']],
  });
  await appendWorkLog(
    g,
    { logged_at: 'T', phone: '555', name: 'John', place: 'Warehouse', date: '2026-06-20', start: '08:00', end: '16:30', hours: '8.5' },
    ['place', 'date', 'start', 'end'],
  );
  assert.deepEqual(g.dump().WorkLogs[1], ['T', '555', 'John', 'Warehouse', '2026-06-20', '08:00', '16:30', '8.5']);
});

test('adds missing columns for a new question key', async () => {
  const g = createMemoryGateway({
    WorkLogs: [['logged_at', 'phone', 'name', 'place', 'hours']],
  });
  await appendWorkLog(
    g,
    { logged_at: 'T', phone: '555', name: 'John', place: 'Warehouse', notes: 'late start' },
    ['place', 'notes'],
  );
  assert.deepEqual(g.dump().WorkLogs[0], ['logged_at', 'phone', 'name', 'place', 'hours', 'notes']);
  assert.deepEqual(g.dump().WorkLogs[1], ['T', '555', 'John', 'Warehouse', '', 'late start']);
});

test('initializes header when WorkLogs is empty', async () => {
  const g = createMemoryGateway({ WorkLogs: [] });
  await appendWorkLog(g, { logged_at: 'T', phone: '555', name: 'John', place: 'W' }, ['place']);
  assert.deepEqual(g.dump().WorkLogs[0], ['logged_at', 'phone', 'name', 'place', 'hours']);
});
```

- [ ] **Step 5: Implement `packages/whatsapp-bot/src/data/worklogs.ts`**

```ts
import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';

export async function appendWorkLog(
  gateway: SheetsGateway,
  record: Record<string, string>,
  questionKeys: string[],
): Promise<void> {
  const desired = ['logged_at', 'phone', 'name', ...questionKeys, 'hours'];

  const rows = await gateway.readTab('WorkLogs');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];

  // Start from existing header; append any desired columns not present yet.
  const header = [...existing];
  for (const col of desired) {
    if (!header.includes(col)) header.push(col);
  }

  if (existing.length === 0 || header.length !== existing.length) {
    await gateway.writeHeaderRow('WorkLogs', header);
  }

  await gateway.appendRow('WorkLogs', objectToRow(record, header));
}

// re-export for callers that want to read back (kept minimal; unused by bot today)
export { rowsToObjects };
```

- [ ] **Step 6: Run tests + typecheck — verify pass**

Run: `pnpm --filter @scourage/whatsapp-bot test && pnpm --filter @scourage/whatsapp-bot typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/whatsapp-bot/src/data/workers.ts packages/whatsapp-bot/src/data/worklogs.ts packages/whatsapp-bot/src/data/workers.test.ts packages/whatsapp-bot/src/data/worklogs.test.ts
git commit -m "feat(bot): data layer — workers + header-driven worklogs"
```

---

### Task 12: Render + parse one question (per-type)

**Files:**
- Create: `packages/whatsapp-bot/src/conversation/render-question.ts`
- Create: `packages/whatsapp-bot/src/conversation/parse-answer.ts`
- Test: `packages/whatsapp-bot/src/conversation/render-question.test.ts`
- Test: `packages/whatsapp-bot/src/conversation/parse-answer.test.ts`

**Interfaces:**
- Consumes: `Question` (Task 8), `Worker` (Task 11), `OutboundMessage`/`InboundMessage` (Task 10), `parseClockTime` (Task 6), date helpers (Task 7).
- Produces:
  - `renderQuestion(q: Question, worker: Worker): OutboundMessage`
  - `parseAnswer(q: Question, inbound: InboundMessage, tz: string, worker: Worker, now?: Date): { ok: true; value: string } | { ok: false; reprompt: string }`
- Notes:
  - `date` button ids: `date_today`, `date_yesterday`, `date_other`.
  - For `choice`/`worker_places`, list-row ids are `opt_<index>` (0-based). `parseAnswer` accepts the id, OR free text that matches a 1-based number or a case-insensitive option label (so the REPL works by typing).

- [ ] **Step 1: Write the failing test — `packages/whatsapp-bot/src/conversation/render-question.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderQuestion } from './render-question.ts';
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';

const worker: Worker = { phone: '555', name: 'John', greeting: '', places: ['Warehouse', 'Office HQ'], active: true };
const q = (o: Partial<Question>): Question => ({ order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...o });

test('worker_places renders a list of the worker places', () => {
  const m = renderQuestion(q({ type: 'worker_places', text: 'Where?' }), worker);
  assert.equal(m.kind, 'list');
  if (m.kind === 'list') {
    assert.deepEqual(m.rows, [
      { id: 'opt_0', title: 'Warehouse' },
      { id: 'opt_1', title: 'Office HQ' },
    ]);
  }
});

test('date renders three buttons', () => {
  const m = renderQuestion(q({ type: 'date', text: 'Which day?' }), worker);
  assert.equal(m.kind, 'buttons');
  if (m.kind === 'buttons') {
    assert.deepEqual(m.buttons.map((b) => b.id), ['date_today', 'date_yesterday', 'date_other']);
  }
});

test('optional text mentions skip', () => {
  const m = renderQuestion(q({ type: 'text', text: 'Notes?', required: false }), worker);
  assert.equal(m.kind, 'text');
  if (m.kind === 'text') assert.match(m.body, /skip/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: FAIL — cannot find `./render-question.ts`.

- [ ] **Step 3: Implement `packages/whatsapp-bot/src/conversation/render-question.ts`**

```ts
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';
import type { OutboundMessage } from '../whatsapp/types.ts';

function optionList(text: string, options: string[]): OutboundMessage {
  return {
    kind: 'list',
    body: text,
    rows: options.map((title, i) => ({ id: `opt_${i}`, title })),
  };
}

export function renderQuestion(q: Question, worker: Worker): OutboundMessage {
  const suffix = q.required ? '' : " (optional — type 'skip' to skip)";

  switch (q.type) {
    case 'worker_places':
      return optionList(q.text, worker.places);
    case 'choice':
      return optionList(q.text, q.options);
    case 'date':
      return {
        kind: 'buttons',
        body: q.text,
        buttons: [
          { id: 'date_today', title: 'Today' },
          { id: 'date_yesterday', title: 'Yesterday' },
          { id: 'date_other', title: 'Other date' },
        ],
      };
    case 'time':
      return { kind: 'text', body: `${q.text} (e.g. 08:00)${suffix}` };
    case 'number':
    case 'text':
    default:
      return { kind: 'text', body: `${q.text}${suffix}` };
  }
}
```

- [ ] **Step 4: Write the failing test — `packages/whatsapp-bot/src/conversation/parse-answer.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer } from './parse-answer.ts';
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';

const tz = 'Asia/Jerusalem';
const now = new Date('2026-06-20T09:00:00Z');
const worker: Worker = { phone: '555', name: 'John', greeting: '', places: ['Warehouse', 'Office HQ'], active: true };
const q = (o: Partial<Question>): Question => ({ order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...o });

test('worker_places accepts list id and typed number/label', () => {
  const wp = q({ type: 'worker_places' });
  assert.deepEqual(parseAnswer(wp, { phone: '555', selectionId: 'opt_1' }, tz, worker, now), { ok: true, value: 'Office HQ' });
  assert.deepEqual(parseAnswer(wp, { phone: '555', text: '1' }, tz, worker, now), { ok: true, value: 'Warehouse' });
  assert.deepEqual(parseAnswer(wp, { phone: '555', text: 'office hq' }, tz, worker, now), { ok: true, value: 'Office HQ' });
  assert.equal(parseAnswer(wp, { phone: '555', text: 'nope' }, tz, worker, now).ok, false);
});

test('date today/yesterday and typed', () => {
  const d = q({ type: 'date' });
  assert.deepEqual(parseAnswer(d, { phone: '555', selectionId: 'date_today' }, tz, worker, now), { ok: true, value: '2026-06-20' });
  assert.deepEqual(parseAnswer(d, { phone: '555', selectionId: 'date_yesterday' }, tz, worker, now), { ok: true, value: '2026-06-19' });
  assert.deepEqual(parseAnswer(d, { phone: '555', text: '18/06/2026' }, tz, worker, now), { ok: true, value: '2026-06-18' });
  assert.equal(parseAnswer(d, { phone: '555', selectionId: 'date_other' }, tz, worker, now).ok, false);
});

test('time parses or reprompts', () => {
  const t = q({ type: 'time' });
  assert.deepEqual(parseAnswer(t, { phone: '555', text: '8:00' }, tz, worker, now), { ok: true, value: '08:00' });
  assert.equal(parseAnswer(t, { phone: '555', text: 'noon' }, tz, worker, now).ok, false);
});

test('number parses or reprompts', () => {
  const n = q({ type: 'number' });
  assert.deepEqual(parseAnswer(n, { phone: '555', text: '3' }, tz, worker, now), { ok: true, value: '3' });
  assert.equal(parseAnswer(n, { phone: '555', text: 'three' }, tz, worker, now).ok, false);
});
```

- [ ] **Step 5: Implement `packages/whatsapp-bot/src/conversation/parse-answer.ts`**

```ts
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';
import type { InboundMessage } from '../whatsapp/types.ts';
import { parseClockTime } from '../time/clock.ts';
import { resolveTypedDate, todayISO, yesterdayISO } from '../time/dates.ts';

type Result = { ok: true; value: string } | { ok: false; reprompt: string };

function matchOption(options: string[], inbound: InboundMessage): string | null {
  if (inbound.selectionId?.startsWith('opt_')) {
    const idx = Number(inbound.selectionId.slice(4));
    if (Number.isInteger(idx) && options[idx] !== undefined) return options[idx];
  }
  const t = (inbound.text ?? '').trim();
  if (t === '') return null;
  // 1-based number
  if (/^\d+$/.test(t)) {
    const i = Number(t) - 1;
    if (options[i] !== undefined) return options[i];
  }
  // case-insensitive label
  const hit = options.find((o) => o.toLowerCase() === t.toLowerCase());
  return hit ?? null;
}

function listReprompt(text: string, options: string[]): string {
  return `Please choose one:\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n(${text})`;
}

export function parseAnswer(
  q: Question,
  inbound: InboundMessage,
  tz: string,
  worker: Worker,
  now: Date = new Date(),
): Result {
  switch (q.type) {
    case 'worker_places':
    case 'choice': {
      const options = q.type === 'worker_places' ? worker.places : q.options;
      const hit = matchOption(options, inbound);
      return hit ? { ok: true, value: hit } : { ok: false, reprompt: listReprompt(q.text, options) };
    }
    case 'date': {
      const raw = (inbound.selectionId ?? inbound.text ?? '').trim().toLowerCase();
      if (raw === 'date_today' || raw === 'today') return { ok: true, value: todayISO(tz, now) };
      if (raw === 'date_yesterday' || raw === 'yesterday') return { ok: true, value: yesterdayISO(tz, now) };
      if (raw === 'date_other' || raw === 'other') {
        return { ok: false, reprompt: 'Please type the date as DD/MM/YYYY (e.g. 19/06/2026).' };
      }
      const r = resolveTypedDate(inbound.text ?? '', tz, now);
      if (r.ok) return { ok: true, value: r.iso };
      return {
        ok: false,
        reprompt:
          r.reason === 'future'
            ? 'That date is in the future. Please type a past date (DD/MM/YYYY).'
            : "Sorry, I didn't understand that date. Please type it as DD/MM/YYYY.",
      };
    }
    case 'time': {
      const t = parseClockTime(inbound.text ?? '');
      if (!t) return { ok: false, reprompt: `Please enter the time as HH:MM (e.g. 08:00). — ${q.text}` };
      return { ok: true, value: `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}` };
    }
    case 'number': {
      const t = (inbound.text ?? '').trim();
      const n = Number(t);
      if (t === '' || !Number.isFinite(n)) return { ok: false, reprompt: `Please enter a number. — ${q.text}` };
      return { ok: true, value: String(n) };
    }
    case 'text':
    default: {
      const t = (inbound.text ?? '').trim();
      if (t === '') return { ok: false, reprompt: q.text };
      return { ok: true, value: t };
    }
  }
}
```

- [ ] **Step 6: Run tests — verify pass**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/whatsapp-bot/src/conversation/render-question.ts packages/whatsapp-bot/src/conversation/parse-answer.ts packages/whatsapp-bot/src/conversation/render-question.test.ts packages/whatsapp-bot/src/conversation/parse-answer.test.ts
git commit -m "feat(bot): per-type question render + answer parse"
```

---

### Task 13: Session store

**Files:**
- Create: `packages/whatsapp-bot/src/conversation/session-store.ts`
- Test: `packages/whatsapp-bot/src/conversation/session-store.test.ts`

**Interfaces:**
- Consumes: `Worker` (Task 11), `Question` (Task 8).
- Produces:
  - `interface Session { worker: Worker; questions: Question[]; index: number; answers: Record<string, string>; updatedAt: number; }`
  - `interface SessionStore { get(phone: string): Session | undefined; set(phone: string, s: Session): void; clear(phone: string): void; }`
  - `createMemorySessionStore(ttlMs: number, now?: () => Date): SessionStore` — `get` returns `undefined` if the session is older than `ttlMs`.

- [ ] **Step 1: Write the failing test — `packages/whatsapp-bot/src/conversation/session-store.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySessionStore, type Session } from './session-store.ts';
import type { Worker } from '../data/workers.ts';

const worker: Worker = { phone: '555', name: 'John', greeting: '', places: [], active: true };
const sess = (updatedAt: number): Session => ({ worker, questions: [], index: 0, answers: {}, updatedAt });

test('stores and clears', () => {
  let t = 1000;
  const store = createMemorySessionStore(30_000, () => new Date(t));
  store.set('555', sess(t));
  assert.equal(store.get('555')?.worker.name, 'John');
  store.clear('555');
  assert.equal(store.get('555'), undefined);
});

test('expires after ttl', () => {
  let t = 1000;
  const store = createMemorySessionStore(30_000, () => new Date(t));
  store.set('555', sess(t));
  t = 1000 + 31_000;
  assert.equal(store.get('555'), undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: FAIL — cannot find `./session-store.ts`.

- [ ] **Step 3: Implement `packages/whatsapp-bot/src/conversation/session-store.ts`**

```ts
import type { Worker } from '../data/workers.ts';
import type { Question } from '../questions/types.ts';

export interface Session {
  worker: Worker;
  questions: Question[];
  index: number;
  answers: Record<string, string>;
  updatedAt: number;
}

export interface SessionStore {
  get(phone: string): Session | undefined;
  set(phone: string, s: Session): void;
  clear(phone: string): void;
}

export function createMemorySessionStore(
  ttlMs: number,
  now: () => Date = () => new Date(),
): SessionStore {
  const map = new Map<string, Session>();
  return {
    get(phone) {
      const s = map.get(phone);
      if (!s) return undefined;
      if (now().getTime() - s.updatedAt > ttlMs) {
        map.delete(phone);
        return undefined;
      }
      return s;
    },
    set(phone, s) {
      map.set(phone, s);
    },
    clear(phone) {
      map.delete(phone);
    },
  };
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/whatsapp-bot/src/conversation/session-store.ts packages/whatsapp-bot/src/conversation/session-store.test.ts
git commit -m "feat(bot): in-memory session store with TTL"
```

---

### Task 14: Conversation engine (orchestrator)

**Files:**
- Create: `packages/whatsapp-bot/src/conversation/engine.ts`
- Test: `packages/whatsapp-bot/src/conversation/engine.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 6–13.
- Produces:
  - `interface EngineDeps { gateway: SheetsGateway; whatsapp: WhatsAppClient; sessions: SessionStore; getQuestions: () => Promise<Question[]>; tz: string; now: () => Date; }`
  - `handleMessage(deps: EngineDeps, inbound: InboundMessage): Promise<void>` — the full flow: cancel; not-registered; invalid-config; greet + walk questions; per-type parse/reprompt; `skip` for optional; `end`-after-`start` guard; compute `hours`; append WorkLog (retry on save failure); confirmation summary.

- [ ] **Step 1: Write the failing test — `packages/whatsapp-bot/src/conversation/engine.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway, type SheetsGateway } from '@scourage/sheets-helper';
import { handleMessage, type EngineDeps } from './engine.ts';
import { createMemorySessionStore } from './session-store.ts';
import { loadQuestions } from '../questions/load-questions.ts';
import type { OutboundMessage, WhatsAppClient } from '../whatsapp/types.ts';

const DEFAULT_QUESTIONS = [
  ['order', 'key', 'type', 'text', 'options', 'required'],
  ['1', 'place', 'worker_places', 'Where did you work?', '', 'yes'],
  ['2', 'date', 'date', 'Which day?', '', 'yes'],
  ['3', 'start', 'time', 'Start time?', '', 'yes'],
  ['4', 'end', 'time', 'Finish time?', '', 'yes'],
];

function makeDeps(extraTabs: Record<string, string[][]> = {}) {
  const gateway = createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active'],
      ['15551230000', 'John', '', 'Warehouse, Office HQ', 'yes'],
    ],
    Questions: DEFAULT_QUESTIONS,
    WorkLogs: [['logged_at', 'phone', 'name', 'place', 'date', 'start', 'end', 'hours']],
    ...extraTabs,
  });
  const sent: { to: string; msg: OutboundMessage }[] = [];
  const whatsapp: WhatsAppClient = { async send(to, msg) { sent.push({ to, msg }); } };
  const now = () => new Date('2026-06-20T09:00:00Z');
  const deps: EngineDeps = {
    gateway,
    whatsapp,
    sessions: createMemorySessionStore(30 * 60_000, now),
    getQuestions: () => loadQuestions(gateway),
    tz: 'Asia/Jerusalem',
    now,
  };
  return { deps, gateway, sent };
}

const bodies = (sent: { msg: OutboundMessage }[]) =>
  sent.map((s) => (s.msg.kind === 'text' ? s.msg.body : s.msg.body));

test('unregistered phone is rejected', async () => {
  const { deps, sent } = makeDeps();
  await handleMessage(deps, { phone: '19999999999', text: 'hi' });
  assert.match(bodies(sent).join(' '), /not registered/i);
});

test('full happy path writes a WorkLog with computed hours', async () => {
  const { deps, gateway, sent } = makeDeps();
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });        // greet + ask place
  await handleMessage(deps, { phone: '15551230000', selectionId: 'opt_0' }); // Warehouse
  await handleMessage(deps, { phone: '15551230000', selectionId: 'date_today' });
  await handleMessage(deps, { phone: '15551230000', text: '08:00' });
  await handleMessage(deps, { phone: '15551230000', text: '16:30' });

  const log = gateway.dump().WorkLogs;
  assert.equal(log.length, 2);
  assert.deepEqual(log[1].slice(1), ['15551230000', 'John', 'Warehouse', '2026-06-20', '08:00', '16:30', '8.5']);
  assert.match(bodies(sent).at(-1)!, /Logged/);
});

test('finish before start is rejected', async () => {
  const { deps, sent } = makeDeps();
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'opt_0' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'date_today' });
  await handleMessage(deps, { phone: '15551230000', text: '16:00' });
  await handleMessage(deps, { phone: '15551230000', text: '09:00' });
  assert.match(bodies(sent).join(' '), /after.*start|after the start/i);
});

test('reordered + extra question config is honored', async () => {
  const { deps, gateway } = makeDeps({
    Questions: [
      ['order', 'key', 'type', 'text', 'options', 'required'],
      ['1', 'place', 'worker_places', 'Where?', '', 'yes'],
      ['2', 'crew', 'choice', 'Crew size?', '1, 2, 3', 'yes'],
    ],
    WorkLogs: [['logged_at', 'phone', 'name', 'place', 'crew', 'hours']],
  });
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'opt_1' }); // Office HQ
  await handleMessage(deps, { phone: '15551230000', selectionId: 'opt_2' }); // crew = 3
  const log = gateway.dump().WorkLogs;
  assert.deepEqual(log[1].slice(1), ['15551230000', 'John', 'Office HQ', '3', '']);
});

test('cancel resets the session', async () => {
  const { deps, sent } = makeDeps();
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  await handleMessage(deps, { phone: '15551230000', text: 'cancel' });
  assert.match(bodies(sent).join(' '), /cancel/i);
});

test('invalid Questions config tells worker it is not set up', async () => {
  const { deps, sent } = makeDeps({
    Questions: [['order', 'key', 'type', 'text', 'options', 'required']], // empty
  });
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  assert.match(bodies(sent).join(' '), /not set up/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: FAIL — cannot find `./engine.ts`.

- [ ] **Step 3: Implement `packages/whatsapp-bot/src/conversation/engine.ts`**

```ts
import type { SheetsGateway } from '@scourage/sheets-helper';
import type { InboundMessage, WhatsAppClient } from '../whatsapp/types.ts';
import type { Question } from '../questions/types.ts';
import { validateQuestions } from '../questions/validate-config.ts';
import { findWorker, type Worker } from '../data/workers.ts';
import { appendWorkLog } from '../data/worklogs.ts';
import { normalizePhone } from '../data/phone.ts';
import { parseClockTime, computeHours } from '../time/clock.ts';
import { renderQuestion } from './render-question.ts';
import { parseAnswer } from './parse-answer.ts';
import { type Session, type SessionStore } from './session-store.ts';

export interface EngineDeps {
  gateway: SheetsGateway;
  whatsapp: WhatsAppClient;
  sessions: SessionStore;
  getQuestions: () => Promise<Question[]>;
  tz: string;
  now: () => Date;
}

const NOT_REGISTERED =
  "You're not registered yet. Please ask your manager to add your number. 🙏";
const NOT_SET_UP = "The bot isn't set up yet. Please ask your manager.";
const NO_PLACES = 'No work sites are assigned to you yet. Please ask your manager.';
const SAVE_FAILED = "Sorry, I couldn't save that. Please send your last answer again.";

function greeting(w: Worker): string {
  return w.greeting || `Hi ${w.name}!`;
}

async function text(deps: EngineDeps, to: string, body: string): Promise<void> {
  await deps.whatsapp.send(to, { kind: 'text', body });
}

export async function handleMessage(deps: EngineDeps, inbound: InboundMessage): Promise<void> {
  const phone = normalizePhone(inbound.phone);
  const lowered = (inbound.text ?? '').trim().toLowerCase();

  if (lowered === 'cancel') {
    deps.sessions.clear(phone);
    await text(deps, phone, 'Cancelled. Send any message to start again.');
    return;
  }

  let session = deps.sessions.get(phone);

  // New conversation
  if (!session) {
    const worker = await findWorker(deps.gateway, phone);
    if (!worker || !worker.active) {
      await text(deps, phone, NOT_REGISTERED);
      return;
    }

    let questions: Question[];
    try {
      questions = await deps.getQuestions();
    } catch (err) {
      console.error('Failed to load Questions config:', err);
      await text(deps, phone, NOT_SET_UP);
      return;
    }
    const v = validateQuestions(questions);
    if (!v.ok) {
      console.error('Invalid Questions config:', v.errors);
      await text(deps, phone, NOT_SET_UP);
      return;
    }

    await text(deps, phone, greeting(worker));
    session = { worker, questions, index: 0, answers: {}, updatedAt: deps.now().getTime() };
    deps.sessions.set(phone, session);
    await askCurrent(deps, phone, session);
    return;
  }

  // Pending save retry (finalize previously failed)
  if (session.index >= session.questions.length) {
    await finalize(deps, phone, session);
    return;
  }

  const q = session.questions[session.index];

  // Optional question skip
  if (!q.required && lowered === 'skip') {
    session.answers[q.key] = '';
    await advance(deps, phone, session);
    return;
  }

  const parsed = parseAnswer(q, inbound, deps.tz, session.worker, deps.now());
  if (!parsed.ok) {
    await text(deps, phone, parsed.reprompt);
    return;
  }

  // Cross-field: finish must be after start
  if (q.key === 'end' && q.type === 'time' && session.answers['start']) {
    const start = parseClockTime(session.answers['start']);
    const end = parseClockTime(parsed.value);
    if (start && end && computeHours(start, end) === null) {
      await text(deps, phone, 'Finish time must be after the start time. Please re-enter the finish time (e.g. 16:30).');
      return;
    }
  }

  session.answers[q.key] = parsed.value;
  await advance(deps, phone, session);
}

async function askCurrent(deps: EngineDeps, phone: string, session: Session): Promise<void> {
  const q = session.questions[session.index];
  if (q.type === 'worker_places' && session.worker.places.length === 0) {
    await text(deps, phone, NO_PLACES);
    deps.sessions.clear(phone);
    return;
  }
  await deps.whatsapp.send(phone, renderQuestion(q, session.worker));
}

async function advance(deps: EngineDeps, phone: string, session: Session): Promise<void> {
  session.index += 1;
  session.updatedAt = deps.now().getTime();
  if (session.index < session.questions.length) {
    deps.sessions.set(phone, session);
    await askCurrent(deps, phone, session);
  } else {
    await finalize(deps, phone, session);
  }
}

async function finalize(deps: EngineDeps, phone: string, session: Session): Promise<void> {
  const record: Record<string, string> = {
    logged_at: deps.now().toISOString(),
    phone: session.worker.phone,
    name: session.worker.name,
  };
  for (const q of session.questions) record[q.key] = session.answers[q.key] ?? '';

  const startQ = session.questions.find((q) => q.key === 'start' && q.type === 'time');
  const endQ = session.questions.find((q) => q.key === 'end' && q.type === 'time');
  if (startQ && endQ && session.answers['start'] && session.answers['end']) {
    const start = parseClockTime(session.answers['start']);
    const end = parseClockTime(session.answers['end']);
    if (start && end) {
      const h = computeHours(start, end);
      if (h !== null) record['hours'] = String(h);
    }
  }

  const keys = session.questions.map((q) => q.key);
  try {
    await appendWorkLog(deps.gateway, record, keys);
  } catch (err) {
    console.error('Failed to append WorkLog:', err);
    // keep session (index stays at length) so the next message retries
    session.updatedAt = deps.now().getTime();
    deps.sessions.set(phone, session);
    await text(deps, phone, SAVE_FAILED);
    return;
  }

  deps.sessions.clear(phone);
  await text(deps, phone, summary(session, record));
}

function summary(session: Session, record: Record<string, string>): string {
  const parts = session.questions
    .map((q) => `${q.text} ${record[q.key] || '-'}`)
    .join(' · ');
  const hours = record['hours'] ? ` · Hours ${record['hours']}` : '';
  return `Logged ✅ — ${parts}${hours}`;
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: PASS (all engine tests).

- [ ] **Step 5: Commit**

```bash
git add packages/whatsapp-bot/src/conversation/engine.ts packages/whatsapp-bot/src/conversation/engine.test.ts
git commit -m "feat(bot): data-driven conversation engine"
```

---

### Task 15: App wiring + local REPL

**Files:**
- Create: `packages/whatsapp-bot/src/app.ts`
- Create: `packages/whatsapp-bot/src/local/repl.ts`

**Interfaces:**
- Consumes: `Config` (Task 4), gateway (sheets-helper), engine (Task 14), console client (Task 10).
- Produces:
  - `createApp(config: Config): { deps: EngineDeps; }` — builds the gateway, a TTL-cached `getQuestions`, the session store, and chooses the WhatsApp transport. (CloudApiClient wired in Task 16; for now console only — `cloud` transport throws "not yet wired" until Task 16.)
  - REPL: reads stdin lines, turns each into an `InboundMessage` for `config.localWorkerPhone`, calls `handleMessage`.

- [ ] **Step 1: Implement `packages/whatsapp-bot/src/app.ts`**

```ts
import { createGoogleGateway } from '@scourage/sheets-helper';
import type { Config } from './config.ts';
import { createConsoleClient } from './whatsapp/console-client.ts';
import { loadQuestions } from './questions/load-questions.ts';
import { createMemorySessionStore } from './conversation/session-store.ts';
import type { EngineDeps } from './conversation/engine.ts';
import type { WhatsAppClient } from './whatsapp/types.ts';

const SESSION_TTL_MS = 30 * 60_000;
const QUESTIONS_TTL_MS = 60_000;

export function createApp(config: Config, whatsappOverride?: WhatsAppClient): { deps: EngineDeps } {
  const gateway = createGoogleGateway({
    keyFilePath: config.keyFilePath,
    spreadsheetId: config.spreadsheetId,
  });
  const now = () => new Date();

  // TTL-cached questions provider
  let cache: { at: number; qs: Awaited<ReturnType<typeof loadQuestions>> } | null = null;
  const getQuestions = async () => {
    const t = now().getTime();
    if (cache && t - cache.at < QUESTIONS_TTL_MS) return cache.qs;
    const qs = await loadQuestions(gateway);
    cache = { at: t, qs };
    return qs;
  };

  let whatsapp = whatsappOverride;
  if (!whatsapp) {
    if (config.transport === 'console') {
      whatsapp = createConsoleClient();
    } else {
      throw new Error('cloud transport is wired in server.ts (Task 16), not here');
    }
  }

  const deps: EngineDeps = {
    gateway,
    whatsapp,
    sessions: createMemorySessionStore(SESSION_TTL_MS, now),
    getQuestions,
    tz: config.timezone,
    now,
  };
  return { deps };
}
```

- [ ] **Step 2: Implement `packages/whatsapp-bot/src/local/repl.ts`**

```ts
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadConfig } from '../config.ts';
import { createApp } from '../app.ts';
import { handleMessage } from '../conversation/engine.ts';

const config = loadConfig(process.env);
if (config.transport !== 'console') {
  console.error('repl.ts requires WHATSAPP_TRANSPORT=console');
  process.exit(1);
}
if (!config.localWorkerPhone) {
  console.error('Set LOCAL_WORKER_PHONE in .env');
  process.exit(1);
}

const { deps } = createApp(config);
const rl = createInterface({ input: stdin, output: stdout });

console.log(`Simulating worker ${config.localWorkerPhone}. Type messages (Ctrl+C to quit).`);
console.log('Tip: send any message to start; use numbers or button text to answer.\n');

for (;;) {
  const line = await rl.question('you> ');
  await handleMessage(deps, { phone: config.localWorkerPhone, text: line });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @scourage/whatsapp-bot typecheck`
Expected: PASS.

- [ ] **Step 4: Manual smoke (requires a real test Sheet + service-account key)**

Set up `.env` (copy `.env.example`, fill `SHEETS_SPREADSHEET_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `COMPANY_TIMEZONE`, `LOCAL_WORKER_PHONE` matching a row in the Workers tab). Then:

Run: `cd packages/whatsapp-bot && pnpm dev:local`
Expected: greeting prints, place list prints; completing the flow appends a row to the test Sheet's `WorkLogs` tab.

(If you don't have the Sheet yet, skip the manual run — automated tests already cover the logic. Do not block the commit on it.)

- [ ] **Step 5: Commit**

```bash
git add packages/whatsapp-bot/src/app.ts packages/whatsapp-bot/src/local/repl.ts
git commit -m "feat(bot): app wiring + local REPL harness"
```

---

### Task 16: Cloud API client + HTTP webhook server

**Files:**
- Create: `packages/whatsapp-bot/src/whatsapp/cloud-api-client.ts`
- Create: `packages/whatsapp-bot/src/server.ts`
- Test: `packages/whatsapp-bot/src/whatsapp/cloud-api-client.test.ts`

**Interfaces:**
- Consumes: `OutboundMessage`/`WhatsAppClient` (Task 10), `Config` (Task 4), `createApp` (Task 15), `parseWebhook` + `verifySignature` (Task 10), `handleMessage` (Task 14).
- Produces:
  - `toGraphPayload(to: string, msg: OutboundMessage): unknown` — maps to the Graph API message JSON (text / interactive buttons / interactive list). **Exported for unit testing.**
  - `createCloudApiClient(opts: { token: string; phoneNumberId: string; fetchImpl?: typeof fetch }): WhatsAppClient`
  - `server.ts` — `node:http` server: `GET /webhook` verify handshake; `POST /webhook` → signature check → `parseWebhook` → `handleMessage`. Always responds `200` quickly.

- [ ] **Step 1: Write the failing test — `packages/whatsapp-bot/src/whatsapp/cloud-api-client.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toGraphPayload } from './cloud-api-client.ts';

test('maps text', () => {
  const p = toGraphPayload('555', { kind: 'text', body: 'hi' }) as any;
  assert.equal(p.to, '555');
  assert.equal(p.type, 'text');
  assert.equal(p.text.body, 'hi');
});

test('maps buttons (interactive)', () => {
  const p = toGraphPayload('555', {
    kind: 'buttons', body: 'Which day?',
    buttons: [{ id: 'date_today', title: 'Today' }],
  }) as any;
  assert.equal(p.type, 'interactive');
  assert.equal(p.interactive.type, 'button');
  assert.equal(p.interactive.action.buttons[0].reply.id, 'date_today');
});

test('maps list (interactive)', () => {
  const p = toGraphPayload('555', {
    kind: 'list', body: 'Where?',
    rows: [{ id: 'opt_0', title: 'Warehouse' }],
  }) as any;
  assert.equal(p.interactive.type, 'list');
  assert.equal(p.interactive.action.sections[0].rows[0].id, 'opt_0');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scourage/whatsapp-bot test`
Expected: FAIL — cannot find `./cloud-api-client.ts`.

- [ ] **Step 3: Implement `packages/whatsapp-bot/src/whatsapp/cloud-api-client.ts`**

```ts
import type { OutboundMessage, WhatsAppClient } from './types.ts';

export function toGraphPayload(to: string, msg: OutboundMessage): unknown {
  if (msg.kind === 'text') {
    return { messaging_product: 'whatsapp', to, type: 'text', text: { body: msg.body } };
  }
  if (msg.kind === 'buttons') {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: msg.body },
        action: {
          buttons: msg.buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    };
  }
  // list
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: msg.body },
      action: {
        button: 'Choose',
        sections: [
          { rows: msg.rows.map((r) => ({ id: r.id, title: r.title.slice(0, 24) })) },
        ],
      },
    },
  };
}

export function createCloudApiClient(opts: {
  token: string;
  phoneNumberId: string;
  fetchImpl?: typeof fetch;
}): WhatsAppClient {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `https://graph.facebook.com/v21.0/${opts.phoneNumberId}/messages`;
  return {
    async send(to, msg) {
      const res = await doFetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toGraphPayload(to, msg)),
      });
      if (!res.ok) {
        console.error('WhatsApp send failed:', res.status, await res.text().catch(() => ''));
      }
    },
  };
}
```

- [ ] **Step 4: Implement `packages/whatsapp-bot/src/server.ts`**

```ts
import { createServer } from 'node:http';
import { loadConfig } from './config.ts';
import { createApp } from './app.ts';
import { handleMessage } from './conversation/engine.ts';
import { parseWebhook } from './whatsapp/parse-webhook.ts';
import { verifySignature } from './whatsapp/verify-signature.ts';
import { createCloudApiClient } from './whatsapp/cloud-api-client.ts';

const config = loadConfig(process.env);
const whatsapp = createCloudApiClient({
  token: config.whatsappToken,
  phoneNumberId: config.whatsappPhoneNumberId,
});
const { deps } = createApp(config, whatsapp);

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost`);

  if (req.method === 'GET' && url.pathname === '/webhook') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === config.metaVerifyToken) {
      res.writeHead(200).end(challenge ?? '');
    } else {
      res.writeHead(403).end('forbidden');
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/webhook') {
    const raw = await readBody(req);
    const sig = req.headers['x-hub-signature-256'] as string | undefined;
    if (!verifySignature(raw, sig, config.metaAppSecret)) {
      res.writeHead(401).end('bad signature');
      return;
    }
    // Respond immediately; process asynchronously.
    res.writeHead(200).end('ok');
    try {
      const inbound = parseWebhook(JSON.parse(raw));
      if (inbound) await handleMessage(deps, inbound);
    } catch (err) {
      console.error('webhook handling error:', err);
    }
    return;
  }

  res.writeHead(404).end('not found');
});

server.listen(config.port, () => {
  console.log(`Webhook server listening on :${config.port}`);
});
```

- [ ] **Step 5: Run tests + typecheck — verify pass**

Run: `pnpm --filter @scourage/whatsapp-bot test && pnpm --filter @scourage/whatsapp-bot typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/whatsapp-bot/src/whatsapp/cloud-api-client.ts packages/whatsapp-bot/src/server.ts packages/whatsapp-bot/src/whatsapp/cloud-api-client.test.ts
git commit -m "feat(bot): Cloud API client + node:http webhook server"
```

---

### Task 17: End-to-end console test, default Questions seed, README

**Files:**
- Create: `packages/whatsapp-bot/src/conversation/e2e-console.test.ts`
- Create: `docs/default-questions-seed.md`
- Create: `README.md`

**Interfaces:**
- Consumes: engine (Task 14), console client (Task 10), memory gateway (Task 3).
- Produces: a full conversation driven through the engine with the `ConsoleClient` capturing output, asserting both the transcript and the written `WorkLogs` row; operator docs.

- [ ] **Step 1: Write the e2e test — `packages/whatsapp-bot/src/conversation/e2e-console.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { createConsoleClient } from '../whatsapp/console-client.ts';
import { createMemorySessionStore } from './session-store.ts';
import { loadQuestions } from '../questions/load-questions.ts';
import { handleMessage, type EngineDeps } from './engine.ts';

test('console transport drives a full conversation end to end', async () => {
  const gateway = createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active'],
      ['15551230000', 'John', 'Welcome back John!', 'Warehouse, Office HQ', 'yes'],
    ],
    Questions: [
      ['order', 'key', 'type', 'text', 'options', 'required'],
      ['1', 'place', 'worker_places', 'Where did you work?', '', 'yes'],
      ['2', 'date', 'date', 'Which day?', '', 'yes'],
      ['3', 'start', 'time', 'Start time?', '', 'yes'],
      ['4', 'end', 'time', 'Finish time?', '', 'yes'],
    ],
    WorkLogs: [['logged_at', 'phone', 'name', 'place', 'date', 'start', 'end', 'hours']],
  });

  const lines: string[] = [];
  const now = () => new Date('2026-06-20T09:00:00Z');
  const deps: EngineDeps = {
    gateway,
    whatsapp: createConsoleClient((l) => lines.push(l)),
    sessions: createMemorySessionStore(30 * 60_000, now),
    getQuestions: () => loadQuestions(gateway),
    tz: 'Asia/Jerusalem',
    now,
  };

  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  await handleMessage(deps, { phone: '15551230000', text: '1' });          // Warehouse
  await handleMessage(deps, { phone: '15551230000', text: 'today' });
  await handleMessage(deps, { phone: '15551230000', text: '08:00' });
  await handleMessage(deps, { phone: '15551230000', text: '16:30' });

  const transcript = lines.join('\n');
  assert.match(transcript, /Welcome back John!/);
  assert.match(transcript, /Logged ✅/);

  const row = gateway.dump().WorkLogs[1];
  assert.deepEqual(row.slice(1), ['15551230000', 'John', 'Warehouse', '2026-06-20', '08:00', '16:30', '8.5']);
});
```

- [ ] **Step 2: Run the full suite — verify pass**

Run: `pnpm -r test`
Expected: PASS across both packages.

- [ ] **Step 3: Create `docs/default-questions-seed.md`**

```markdown
# Default `Questions` tab seed

Paste these rows into the `Questions` tab (row 1 is the header). The admin can
reorder, retext, add, or remove rows afterwards.

| order | key   | type          | text                      | options | required |
|-------|-------|---------------|---------------------------|---------|----------|
| 1     | place | worker_places | Where did you work?       |         | yes      |
| 2     | date  | date          | Which day did you work?   |         | yes      |
| 3     | start | time          | What time did you start?  |         | yes      |
| 4     | end   | time          | What time did you finish? |         | yes      |

## Rules the admin must know
- `key` is the internal id and the WorkLogs column name — don't reuse a key.
- Keep **exactly one** `worker_places` question.
- For automatic `hours`, keep both a `start` and an `end` question of type `time`.
- `choice` questions need a comma-separated `options` cell.
- `required` defaults to yes; put `no` to let workers skip a question.

## Other tabs (headers)
- **Workers:** `phone | name | greeting | places | active`
- **Places:** `place_name | active`
- **WorkLogs:** `logged_at | phone | name | place | date | start | end | hours` (the bot extends this automatically)
```

- [ ] **Step 4: Create `README.md`**

```markdown
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
```

- [ ] **Step 5: Final full verification**

Run: `pnpm -r typecheck && pnpm -r test`
Expected: typecheck clean, all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/whatsapp-bot/src/conversation/e2e-console.test.ts docs/default-questions-seed.md README.md
git commit -m "test(bot): end-to-end console flow + operator docs"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** Workers/Places/Questions/WorkLogs tabs (Tasks 3, 8, 11); per-worker places (Task 11/12); typed questions + full freedom (Tasks 8, 9, 12, 14); header-driven WorkLogs (Task 11); computed hours by `start`/`end` keys (Task 14); config validation fail-safe (Tasks 9, 14); console transport + REAL-sheet local run (Tasks 10, 15); Cloud API + signature-verified webhook (Tasks 10, 16); local-first ordering (Tasks 15, 17 docs).
- **`hours` cross-field:** the finish-after-start guard lives in the engine (Task 14), and `computeHours` returns `null` for non-positive spans (Task 6) — belt and suspenders.
- **Type consistency:** `SheetsGateway`, `Question`, `Worker`, `InboundMessage`/`OutboundMessage`, `EngineDeps`, `Session`/`SessionStore` are each defined once and imported everywhere.
- **Known v1 limitations (from spec, intentionally not built):** overnight shifts, branching questions, per-worker question sets, admin bot commands, persistent sessions.
