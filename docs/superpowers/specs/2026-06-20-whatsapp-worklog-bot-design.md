# WhatsApp Work-Log Bot — Design Spec

**Date:** 2026-06-20
**Status:** Approved design — ready for implementation plan
**Project:** `slavery-courage` monorepo

## 1. Purpose

A WhatsApp bot that lets hourly workers at a company log the work they did —
typically **which place they worked at, on which day, and the start/finish
times.** Each completed entry is appended to a Google Sheet that serves as the
company's database and source of truth. A worker is greeted personally when they
message the bot, then walked through a short guided flow.

**The flow itself is data-driven:** the questions the bot asks are defined in a
`Questions` tab in the spreadsheet, so the admin can change the **number, order,
text, and answer options** of questions — and add or remove questions — entirely
on their own, without code changes. Each question has a **type** that carries any
special behavior (e.g. per-worker place list, date resolution, time parsing).

The first version focuses on the **worker-facing logging flow**. Admin
management is done by editing the spreadsheet directly (no admin bot commands in
v1).

## 2. Key Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Database | **Google Sheets** via a **service account** (JSON key) | No human login, runs unattended 24/7; admin shares the sheet with the service-account email once. |
| WhatsApp channel | **Official WhatsApp Cloud API** (Meta Graph API + webhook) | TOS-compliant, stable, free at low volume. Worker always initiates → every reply is inside the 24h service window, so **no paid message templates needed**. |
| Place selection | **Per-worker assigned places**, shown as a WhatsApp **interactive list** (single-select / radio-button behavior) | Worker only sees the sites they're allowed to work at; clean, tappable UX. |
| Place storage | A **`places` column in the Workers tab** (comma-separated names), validated against a master `Places` tab | Easiest for a human admin — one row per worker, everything visible at a glance. |
| Date of work | **Asked each log**: Today / Yesterday buttons, or type an explicit date | Workers may log a shift they forgot to record earlier. |
| Hours entry | Worker types **start + end clock times**; bot computes duration | Captures the actual time window (useful for audits), not just a total. |
| **Configurable questions** | The flow is read from a **`Questions` tab** at runtime; each question has a **type**. Admin changes number/order/text/options freely; `choice` options live in an `options` cell. **Full typed freedom** — even place/date/time questions live in the tab. | Admin self-service without developer involvement; types preserve the load-bearing behavior. |
| Computed hours | `hours` is an **auto-computed** WorkLogs column derived from the `start` + `end` time answers (by key) — not itself a question. | Keeps the duration logic correct regardless of how questions are reordered/retexted. |
| Admin (v1) | **Spreadsheet only** — no admin bot commands | Fastest path to the core feature; the sheet already gives admin everything. |
| Unknown numbers | **Polite reject** — "not registered, ask your manager" | Keeps the system closed and clean. |
| Stack | **Node.js + TypeScript**, pnpm monorepo | Best WhatsApp webhook + Google Sheets ecosystem; type safety. |
| Local testing | **Console WhatsApp transport + real throwaway test Sheet** | Play the whole conversation in a terminal REPL (no Meta needed) while real rows appear in a test spreadsheet — full confidence **before** any Meta setup or git push. |

## 3. Architecture & Monorepo Layout

The worker always messages first, so the bot is a **reply-only webhook server** —
no proactive/template messaging required.

**Two design seams make full local testing possible (see §6):**

1. **Outbound transport** — a `WhatsAppClient` interface in front of WhatsApp,
   with two implementations: `CloudApiClient` (real Graph API) and
   `ConsoleClient` (prints replies to the terminal). Chosen by config.
2. **Normalized inbound message** — the conversation engine consumes a
   source-agnostic `InboundMessage` (`{ phone, text?, selectionId? }`). Two
   entry points produce it: the real Express webhook (parses the Meta payload)
   and the local REPL (reads stdin). The engine never knows which.

```
slavery-courage/
├── packages/
│   ├── sheets-helper/        # Reusable Google Sheets library.
│   │                         #   Service-account auth + generic read/append/find on a tab.
│   │                         #   Also serves the separate "create a table in my personal
│   │                         #   spreadsheet" use case for this monorepo.
│   └── whatsapp-bot/         # The bot.
│       ├── server.ts         # Express: GET /webhook (Meta verify) + POST /webhook (messages)
│       ├── whatsapp/
│       │   ├── client.ts          # WhatsAppClient interface + InboundMessage / OutboundMessage types
│       │   ├── cloud-api-client.ts # Real Graph API impl (send text / buttons / interactive list)
│       │   ├── console-client.ts   # Local impl: renders replies to the terminal
│       │   └── parse-webhook.ts    # Meta webhook payload → normalized InboundMessage
│       ├── questions/
│       │   ├── types.ts           # Question + QuestionType definitions
│       │   ├── load-questions.ts   # Reads the Questions tab → ordered Question[]
│       │   └── validate-config.ts  # Validates the config on load (see §7)
│       ├── conversation/     # Generic engine: session store + question-walker + per-type render/parse
│       ├── data/             # Domain layer over sheets-helper (workers, places, worklogs)
│       ├── local/repl.ts     # `dev:local` harness — terminal REPL that plays a worker
│       └── config.ts         # Env vars (incl. WHATSAPP_TRANSPORT = cloud | console)
└── package.json              # pnpm workspace root
```

### Stateful-conversation approach

Webhooks are stateless HTTP, but the flow is multi-step. **v1 uses an in-memory
session store** keyed by the worker's phone number, with a ~30-minute idle
timeout.

- **Trade-off:** sessions reset if the server restarts mid-conversation
  (acceptable — the worker simply re-sends to start over).
- **Future upgrade:** persist sessions (e.g., Firestore/Redis/a sheet tab) for
  multi-instance or restart resilience.

## 4. Data Model — four tabs in the spreadsheet

| Tab | Columns | Who writes |
|---|---|---|
| **Workers** | `phone` · `name` · `greeting` (optional custom) · `places` (comma-separated place names) · `active` | Admin (by hand) |
| **Places** | `place_name` · `active` | Admin (by hand) — master list, used to validate the names in each worker's `places` cell |
| **Questions** | `order` · `key` · `type` · `text` · `options` · `required` | Admin (by hand) — **defines the conversation** |
| **WorkLogs** | `logged_at` · `phone` · `name` · **one column per question `key`** · `hours` (computed) | **Bot** (append-only) |

### Workers / Places
- **Phone** is the identity key. Normalize to a canonical form (digits only, with
  country code) on both read and webhook-receive so matching is reliable.
- **Greeting** is personalized: use the custom `greeting` cell if set, else
  `"Hi {name}!"`.
- **Per-worker places:** the bot reads the worker's `places` cell, splits on
  commas, trims, and validates each name against the active master `Places`
  list. A typo in the Workers tab surfaces (logged/skipped) instead of showing a
  broken option.
- A worker working different places on different days is naturally supported:
  each WorkLog row carries its own place and date.

### Questions tab (drives the flow)

| column | meaning |
|---|---|
| `order` | integer; the order questions are asked (sorted ascending) |
| `key` | stable internal id for the answer (e.g. `place`, `date`, `start`, `end`, `notes`). **Maps to a WorkLogs column.** Worker never sees it. |
| `type` | one of the fixed types below — carries the special behavior |
| `text` | the worker-facing question text (admin edits this freely) |
| `options` | comma-separated answer options — **only used by `choice`** |
| `required` | `yes` / `no`; `no` lets the worker skip the question |

**Question types (fixed menu):**

| type | render | parse / behavior | options source |
|---|---|---|---|
| `worker_places` | interactive single-select list | the chosen place | the worker's `places` cell (dynamic, per-worker) |
| `date` | Today / Yesterday / Other buttons | resolves to a real date (company TZ); typed `DD/MM/YYYY`, no future dates | — |
| `time` | text prompt | parses a clock time (e.g. `08:00`) | — |
| `choice` | interactive single-select list | the chosen option | the `options` cell |
| `text` | text prompt | free text | — |
| `number` | text prompt | numeric value | — |

- **Stable key vs editable text:** `key` is the identity (and the WorkLogs column
  name); `text` is what the worker reads. The admin retexts freely by editing
  `text`. Renaming a `key` is treated as a new field (a new WorkLogs column).
- The admin **reorders** by changing `order`, **adds** a question by adding a row,
  **removes** by deleting a row, **retexts** via `text`, and **edits options** via
  the `options` cell.

### WorkLogs (header-driven, adapts to the questions)
- The bot writes by **column header name**, not fixed position. On save it reads
  the `WorkLogs` header row, ensures a column exists for `logged_at`, `phone`,
  `name`, each question `key` (in `order`), and `hours`; appends any missing
  columns; then writes the row aligned to the current header. So adding/removing a
  question never corrupts historical rows.
- **`hours`** is computed automatically **when questions with keys `start` and
  `end` of type `time` both exist** (`hours = end − start`, same date). If that
  pair isn't present, no `hours` column is produced and config validation warns
  (see §7).

## 5. Conversation Flow (data-driven engine)

The flow is no longer hardcoded. On a new conversation the bot **loads the
`Questions` tab** (sorted by `order`) and walks the worker through each question,
one at a time. State is "which question index are we on", not named steps.

```
IDLE → worker messages
   ├─ phone NOT in Workers          → "You're not registered yet. Please ask your
   │                                   manager to add your number. 🙏"  (stay IDLE)
   ├─ no questions / invalid config → "The bot isn't set up yet. Please ask your
   │                                   manager."  (stay IDLE; details logged)     (stay IDLE)
   └─ found                         → greet personally, load Questions,
                                       ask question[0] ──→ ASKING (index 0)

ASKING(i) → worker answers question[i]
   ├─ render by type:
   │     worker_places → interactive list of THIS worker's places
   │     choice        → interactive list of the row's `options`
   │     date          → [ Today ] [ Yesterday ] [ Other date ] (Other → type DD/MM/YYYY)
   │     time          → text prompt "(e.g. 08:00)"
   │     text / number → text prompt
   ├─ validate by type (bad input → re-prompt, stay on i)
   ├─ if required = no and worker sends "skip" → store empty, advance
   └─ store answer[key] → i+1
        ├─ more questions → ask question[i+1]
        └─ none left      → compute `hours` (if start+end present) →
                            confirmation summary (every answer, by question text) +
                            append row to WorkLogs ──→ IDLE
```

Example confirmation:
`Logged ✅ — Where did you work? Warehouse · Which day? 20/06/2026 · Start 08:00 · Finish 16:30 · Hours 8.5`

- **`cancel`** keyword at any step resets to IDLE.
- **`worker_places` / `choice`** render as WhatsApp interactive **lists**
  (single-select, up to 10 rows; >10 falls back to a numbered text list).
- **`date`** renders as ≤3 interactive **buttons** (Today / Yesterday / Other).
- **Worker with no assigned places** hitting a `worker_places` question →
  "No work sites are assigned to you yet. Please ask your manager." and abort.
- The engine re-reads the Questions tab at the **start of each conversation**, so
  an admin's edits take effect on the next worker interaction (a short in-memory
  cache with a TTL avoids a Sheets read on every single message).

## 6. Local Development & Testing

**Goal: run and exercise the entire bot locally, with confidence, before any Meta
setup or git push.** The two seams from §3 make this possible.

### `pnpm dev:local` — the terminal REPL
- Starts the conversation engine wired to the **`ConsoleClient`** transport and a
  configurable **simulated worker phone** (env: `LOCAL_WORKER_PHONE`).
- You type the worker's messages; the bot's replies — including the place list
  and Today/Yesterday/Other buttons — render as plain text in the terminal.
- The **data layer is the real one**, pointed at a **throwaway test
  spreadsheet** (env: `SHEETS_SPREADSHEET_ID` set to the test sheet). So you
  watch real rows land in the `WorkLogs` tab and read real `Workers`/`Places`
  data — a genuine end-to-end test of the Sheets integration with no Meta
  involvement.

```
$ pnpm dev:local
bot> Hi John! Where did you work?
  1. Warehouse     2. Office HQ
you> 1
bot> Which day did you work?  [Today] [Yesterday] [Other date]
you> Today
bot> What time did you start? (e.g. 08:00)
you> 08:00
bot> What time did you finish? (e.g. 16:30)
you> 16:30
bot> Logged: Warehouse, 20/06/2026, 08:00–16:30 = 8.5h ✅   (row appears in the test Sheet)
```

### Progression to production (the order things get "real")
1. **Logic + Sheets** — `pnpm dev:local` + unit/integration tests. No external
   accounts beyond the Google service account + test sheet.
2. **Real WhatsApp** — set `WHATSAPP_TRANSPORT=cloud`, run `pnpm dev`, expose it
   with an HTTPS tunnel (e.g. ngrok), point the Meta webhook at the tunnel URL,
   and message the bot from a real phone.
3. **Push to git / deploy** — only after the above pass.

### Config / env vars
`WHATSAPP_TRANSPORT` (`cloud` | `console`) · `LOCAL_WORKER_PHONE` ·
`SHEETS_SPREADSHEET_ID` · `GOOGLE_APPLICATION_CREDENTIALS` (service-account key
path) · `COMPANY_TIMEZONE` · `WHATSAPP_TOKEN` · `WHATSAPP_PHONE_NUMBER_ID` ·
`META_APP_SECRET` · `META_VERIFY_TOKEN` · `PORT`. Provided via a `.env` file
(gitignored); a committed `.env.example` documents them.

## 7. Error Handling, Security, Testing

### Error handling
- **Bad time format** → re-prompt with an example; do not advance state.
- **End ≤ start** (would be negative/zero hours) → reject and re-ask. Overnight
  shifts (end next day) are deferred to a future version.
- **Unparseable / future date** in "Other date" → re-prompt with the format
  example.
- **Sheets API failure on save** → reply "Couldn't save, please try again",
  **keep the session** so a retry works, log the error server-side.
- **Session idle timeout** (~30 min) → silently reset to IDLE.

### Questions-config validation (on load)
The `validate-config.ts` step checks the `Questions` tab when it's loaded and
**fails safe** — if the config is broken, the bot tells the worker it isn't set
up and logs the specifics for the admin, rather than asking nonsense. Checks:
- **No questions / empty tab** → bot is "not set up".
- **Duplicate `key`** → error (would collide on the same WorkLogs column).
- **Unknown `type`** → error.
- **`choice` with no `options`** → error.
- **`worker_places` count ≠ 1** (zero or many) → error (ambiguous place mapping).
- **Hours warning** → if both `start` and `end` `time` questions aren't present,
  log a warning and simply don't produce a `hours` column (not fatal).
- **Non-integer / duplicate `order`** → sort stably and warn.

### Security (PR gate)
- Verify the Meta webhook **signature** (`X-Hub-Signature-256`) on every POST.
- Verify the **verify-token** on the GET subscription handshake.
- All secrets (Graph API token, app secret, verify token, service-account key)
  come from **environment variables**, never committed. Service-account key file
  path is env-configured.

### Timezone
- A single **company timezone** config value drives "today"/"yesterday"
  resolution and all time math.

### Testing (required — unit + integration)
- **Unit:** time parsing, hours computation, date resolution (today/yesterday/
  typed), phone normalization, per-type render + parse + validate, per-worker
  place parsing, **Questions-config loading + validation** (each failure case
  above), and the header-driven WorkLogs column mapping.
- **Config-driven flow:** drive the engine with several **different `Questions`
  configs** (reordered, extra `choice`/`text` questions added, a question
  removed) and assert the bot asks the right things in the right order and writes
  the right WorkLogs columns — this is the core of the "admin edits the sheet"
  promise.
- **Integration:** one end-to-end test that drives a full conversation
  (register-check → each question → WorkLog append) against mocked Google Sheets
  and a fake WhatsApp send client. The `ConsoleClient` + `InboundMessage` seams
  (§6) are what make this test — and the manual REPL — possible without Meta.

## 8. Out of Scope (v1) / Future

- Admin bot commands (add worker, add place, `/report`) — admin edits the sheet.
- Self-registration for unknown numbers.
- Overnight / cross-midnight shifts.
- Persistent (cross-restart, multi-instance) session storage.
- A separate admin web dashboard.
- Editing or deleting a previously logged entry from WhatsApp.
- **New question *types*** beyond the fixed menu (the admin composes from the
  existing types; adding a brand-new type is a code change).
- Conditional / branching questions (ask Q3 only if Q2 = X) — flow is linear.
- Per-worker or per-place *different* question sets — one shared Questions config.

## 9. One-time Setup Checklist (operational, not code)

To be expanded in the implementation plan, but at a high level:

1. **Google (needed for local testing):** create a GCP project + service
   account, enable the Sheets API, download the JSON key, share a **throwaway
   test spreadsheet** with the service-account email (Editor). Create the
   `Workers`, `Places`, `Questions`, and `WorkLogs` tabs with headers, and seed
   the `Questions` tab with the default flow (place / date / start / end). **This
   is the only setup required to run `pnpm dev:local` and validate the whole
   flow.** A documented default `Questions` seed will ship with the repo so the
   admin has a working starting point to edit.
2. **Meta/WhatsApp (only when going real):** create a Meta Business + WhatsApp
   Business app, get a dedicated phone number, obtain the permanent access
   token, app secret, and set the webhook URL + verify token.
3. **Hosting (deploy time):** deploy the bot to a host with a public HTTPS
   endpoint for the webhook (e.g., Cloud Run / Railway / Render / a VPS).
