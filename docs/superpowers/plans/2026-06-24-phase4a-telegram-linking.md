# Phase 4a — Telegram Self-Service Linking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Workers/admins link their Telegram chat to their Worker row by tapping a "Connect Telegram" deep link; a webhook records their `telegram_chat_id`. Unblocks `notifyAdmins` and future per-worker messaging.

**Architecture:** A signed link-token (HMAC, no storage) encodes the worker's phone in a `t.me/<bot>?start=<token>` deep link. The Telegram webhook (`/api/telegram/webhook`, secret-header verified) handles `/start <token>` → verifies → writes `telegram_chat_id` to the Worker row → replies. A connect-status UI on `/app` + `/admin`. An admin route registers the webhook with Telegram.

**Tech Stack:** TypeScript, Next.js 15, Google Sheets, Telegram Bot API, node:crypto, Node test runner via `tsx`.

## Global Constraints

- worklog-core ESM `.ts` imports; tests `pnpm --filter @scourage/worklog-core test`. web extensionless; verify typecheck + build; web tests glob `lib/**/*.test.ts`.
- `gateway.updateRow` is 1-based (i+1).
- Telegram webhook MUST verify the `X-Telegram-Bot-Api-Secret-Token` header against `TELEGRAM_WEBHOOK_SECRET`; always return 200 to Telegram (so it doesn't retry) except on auth failure (401).
- Link token: `base64url(`${normalizedPhone}:${hmacSha256(phone, signingKey).base64url.slice(0,16)}`)` — `[A-Za-z0-9_-]` only, fits Telegram's 64-char start-param limit. Forgery-resistant via HMAC; the signing key is the existing `getSigningKey()` (derived from `GOOGLE_SERVICE_ACCOUNT_JSON`).
- New env vars the user sets: `TELEGRAM_BOT_USERNAME` (deep link), `TELEGRAM_WEBHOOK_SECRET`. Bot token already set (`TELEGRAM_BOT_TOKEN`).
- Admin-guarded admin routes; `runtime='nodejs'`. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: `linkTelegramChat` data layer + telegram_chat_id column

**Files:** Modify `packages/worklog-core/src/data/workers.ts` (add `linkTelegramChat`), `add-worker.ts` (`WORKERS_COLUMNS` += `telegram_chat_id`); export from `index.ts`; test in `workers.test.ts`.

**Interfaces — Produces:** `linkTelegramChat(gateway, phone: string, chatId: string): Promise<boolean>` (true if a worker row was updated).

- [ ] **Step 1: Failing test** — append to `workers.test.ts`:
```ts
import { linkTelegramChat } from './workers.ts';
test('linkTelegramChat writes telegram_chat_id onto the matching worker row', async () => {
  const g = createMemoryGateway({ Workers: [['phone','name','places','active'], ['15551230000','A','','yes']] });
  const ok = await linkTelegramChat(g, '+1 555 123 0000', '987654321');
  assert.equal(ok, true);
  const w = await findWorker(g, '15551230000');
  assert.equal(w?.telegramChatId, '987654321');
  assert.equal(await linkTelegramChat(g, '10000000000', '111'), false); // unknown phone
});
```

- [ ] **Step 2: Run — fail.** `pnpm --filter @scourage/worklog-core test`

- [ ] **Step 3: Implement `linkTelegramChat`** in `workers.ts` (uses `normalizePhone`, header-driven, ensures the column, 1-based updateRow):
```ts
export async function linkTelegramChat(gateway: SheetsGateway, phone: string, chatId: string): Promise<boolean> {
  const target = normalizePhone(phone);
  const rows = await gateway.readTab('Workers');
  if (rows.length === 0) return false;
  const header = rows[0].map((h) => h.trim());
  let tgi = header.indexOf('telegram_chat_id');
  if (tgi < 0) { header.push('telegram_chat_id'); await gateway.writeHeaderRow('Workers', header); tgi = header.length - 1; }
  const phoneIdx = header.indexOf('phone');
  const i = rows.findIndex((r, idx) => idx > 0 && normalizePhone(r[phoneIdx] ?? '') === target);
  if (i < 0) return false;
  const row = [...rows[i]];
  while (row.length < header.length) row.push('');
  row[tgi] = chatId;
  await gateway.updateRow('Workers', i + 1, row);
  return true;
}
```

- [ ] **Step 4:** add `'telegram_chat_id'` to `WORKERS_COLUMNS` in `add-worker.ts`; export `linkTelegramChat` from `index.ts`.

- [ ] **Step 5: Run — pass + typecheck.**

- [ ] **Step 6: Commit.** `git commit -m "feat(core): linkTelegramChat — bind a Telegram chat to a worker row"`

---

### Task 2: Link-token helpers + Connect-Telegram UI

**Files:** Create `packages/web/lib/telegram-link.ts` + `telegram-link.test.ts`; create `packages/web/app/components/telegram-connect.tsx` (server component); add it to `app/app/page.tsx` and `app/admin/page.tsx`.

**Interfaces — Produces:** `makeLinkToken(phone, key): string`, `verifyLinkToken(token, key): string | null`.

- [ ] **Step 1: Failing test** — `telegram-link.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLinkToken, verifyLinkToken } from './telegram-link.ts';
test('link token round-trips and rejects tampering', () => {
  const key = 'test-key';
  const tok = makeLinkToken('15551230000', key);
  assert.match(tok, /^[A-Za-z0-9_-]+$/);     // base64url-safe (Telegram start param)
  assert.equal(verifyLinkToken(tok, key), '15551230000');
  assert.equal(verifyLinkToken(tok, 'wrong-key'), null);
  assert.equal(verifyLinkToken(tok + 'x', key), null);
  assert.equal(verifyLinkToken('garbage', key), null);
});
```

- [ ] **Step 2: Run — fail.** `pnpm --filter @scourage/web test`

- [ ] **Step 3: Implement `telegram-link.ts`:**
```ts
import { createHmac } from 'node:crypto';
function sig(phone: string, key: string): string {
  return createHmac('sha256', key).update(phone).digest('base64url').slice(0, 16);
}
export function makeLinkToken(phone: string, key: string): string {
  return Buffer.from(`${phone}:${sig(phone, key)}`).toString('base64url');
}
export function verifyLinkToken(token: string, key: string): string | null {
  try {
    const [phone, s] = Buffer.from(token, 'base64url').toString('utf8').split(':');
    if (phone && s && sig(phone, key) === s) return phone;
  } catch { /* fall through */ }
  return null;
}
```

- [ ] **Step 4: Connect component** `app/components/telegram-connect.tsx` (server component — a static link, no `'use client'`):
```tsx
import { makeLinkToken } from '../../lib/telegram-link';
import { getSigningKey } from '../../lib/session';

export function TelegramConnect({ phone, linked }: { phone: string; linked: boolean }) {
  const botUser = process.env.TELEGRAM_BOT_USERNAME ?? '';
  if (linked) return <p className="text-sm text-green-700">Telegram connected ✓</p>;
  if (!botUser) return <p className="text-sm text-gray-400">Telegram not configured.</p>;
  const token = makeLinkToken(phone, getSigningKey());
  return (
    <a href={`https://t.me/${botUser}?start=${token}`} target="_blank" rel="noopener noreferrer"
       className="inline-block rounded-lg bg-sky-600 px-3 py-2 text-sm text-white">Connect Telegram</a>
  );
}
```
  (Confirm `getSigningKey` is exported from `lib/session` — it is used by the session signing; if not exported, export it.)

- [ ] **Step 5: Mount it** — in `app/app/page.tsx` (worker) and `app/admin/page.tsx` (admin), render `<TelegramConnect phone={worker.phone} linked={!!worker.telegramChatId} />` near the header. Import depth: from `app/app/page.tsx` → `../components/telegram-connect`; from `app/admin/page.tsx` → `../components/telegram-connect`.

- [ ] **Step 6: Verify.** `pnpm --filter @scourage/web test && pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build`.

- [ ] **Step 7: Commit.** `git commit -m "feat(web): Telegram link token + Connect button on /app and /admin"`

---

### Task 3: Webhook handler + webhook registration

**Files:** Create `packages/web/app/api/telegram/webhook/route.ts`, `packages/web/app/api/admin/telegram/register/route.ts`; add `sendTelegram` to `packages/web/lib/telegram.ts`.

- [ ] **Step 1: `sendTelegram` helper** — add to `lib/telegram.ts` (reuse `buildSendUrl`):
```ts
export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  if (!token) return;
  try {
    await fetch(buildSendUrl(token), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }) });
  } catch (err) { console.error('sendTelegram failed:', err); }
}
```

- [ ] **Step 2: Webhook route** `app/api/telegram/webhook/route.ts`:
```ts
import { getGateway } from '../../../../lib/sheets';
import { getSigningKey } from '../../../../lib/session';
import { verifyLinkToken } from '../../../../lib/telegram-link';
import { sendTelegram } from '../../../../lib/telegram';
import { linkTelegramChat, findWorker } from '@scourage/worklog-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const update = await req.json();
    const msg = update?.message;
    const text: string = msg?.text ?? '';
    const chatId = String(msg?.chat?.id ?? '');
    const m = text.match(/^\/start\s+(\S+)/);
    if (m && chatId) {
      const phone = verifyLinkToken(m[1], getSigningKey());
      if (phone) {
        const gw = getGateway();
        const ok = await linkTelegramChat(gw, phone, chatId);
        const worker = ok ? await findWorker(gw, phone) : null;
        await sendTelegram(chatId, ok ? `✅ Connected${worker?.name ? ', ' + worker.name : ''}! You'll receive FlowCat alerts here.` : 'Could not connect — ask your manager.');
      } else {
        await sendTelegram(chatId, 'Invalid or expired link. Tap "Connect Telegram" in the app again.');
      }
    }
  } catch (err) {
    console.error('telegram webhook error:', err);
  }
  return Response.json({ ok: true }); // always 200 so Telegram doesn't retry
}
```

- [ ] **Step 3: Register route** `app/api/admin/telegram/register/route.ts` — admin-only; registers the webhook with Telegram so the user doesn't hand-curl:
```ts
import { requireAdmin } from '../../../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (!token || !secret) return Response.json({ error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET not set' }, { status: 400 });
  const url = `${new URL(req.url).origin}/api/telegram/webhook`;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secret, allowed_updates: ['message'] }),
  });
  return Response.json(await res.json());
}
```
  (Import depth from `app/api/admin/telegram/register/route.ts` to lib = `../../../../../lib`.)

- [ ] **Step 4: Verify.** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build` (routes `/api/telegram/webhook` + `/api/admin/telegram/register` appear).

- [ ] **Step 5: Commit.** `git commit -m "feat(web): Telegram webhook (link on /start) + admin webhook registration"`

---

## Self-Review Notes
- **Spec coverage:** signed link token (T2), connect UI + status (T2), webhook /start → linkTelegramChat (T1+T3), secret-header verification (T3), webhook registration (T3). Recipient rule unchanged — `notifyAdmins` already sends to `admin=yes` + linked.
- **Security:** token is HMAC-signed (can't link an arbitrary phone without the key); webhook verifies the Telegram secret header; register route is admin-only.
- **Type consistency:** `makeLinkToken`/`verifyLinkToken` (T2) used by the connect component + webhook (T3); `linkTelegramChat`/`findWorker` (T1) by the webhook.
- **No new deps.** Telegram via `fetch`, signing via `node:crypto`.
