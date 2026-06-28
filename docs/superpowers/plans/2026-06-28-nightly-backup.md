# Nightly Drive Backup (§16) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Every night, save a timestamped COPY of the FlowCat spreadsheet to a Google Drive backup folder (history/safety), notify admins on Telegram. Roadmap §16. Runs on Vercel's daily cron (Hobby-compatible).

**Tech Stack:** Next.js 15, Google Drive API (existing `googleapis`), Telegram.

## Global Constraints
- web extensionless imports. Drive via the existing `googleapis` dep + the service-account creds (`GOOGLE_SERVICE_ACCOUNT_JSON`), scope `https://www.googleapis.com/auth/drive`. Gated on `BACKUP_DRIVE_FOLDER_ID` — unset ⇒ endpoint no-ops gracefully. Guarded by `CRON_SECRET`. Commit author = OneStromberg; LOCAL commits only. ponytail.

---

### Task 1: backup helper + cron route + Vercel cron entry
**Files:** Create `packages/web/lib/backup.ts`; create `packages/web/app/api/cron/backup/route.ts`; modify `packages/web/vercel.json` (add the daily cron).

- [ ] **Step 1: `lib/backup.ts`** — `export async function backupSpreadsheet(timestamp: string): Promise<{ ok: true; id: string; name: string } | { ok: false; reason: string }>`:
  - if `!process.env.BACKUP_DRIVE_FOLDER_ID` → return `{ok:false, reason:'BACKUP_DRIVE_FOLDER_ID not set'}`.
  - build a `google.auth.GoogleAuth` from `parseServiceAccountJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)` (from `@scourage/sheets-helper`) with scope `['https://www.googleapis.com/auth/drive']`.
  - `const drive = google.drive({ version: 'v3', auth });`
  - `const res = await drive.files.copy({ fileId: process.env.SHEETS_SPREADSHEET_ID!, requestBody: { name: \`FlowCat backup ${timestamp}\`, parents: [process.env.BACKUP_DRIVE_FOLDER_ID] }, supportsAllDrives: true });`
  - return `{ ok:true, id: res.data.id ?? '', name: \`FlowCat backup ${timestamp}\` }`.
  - Wrap in try/catch → return `{ok:false, reason: String(err)}` (best-effort; never throws).
  (Use `declare`/`any` for the google typings if needed, matching `lib/gcs.ts` style.)
- [ ] **Step 2: `app/api/cron/backup/route.ts`** — `GET`. `CRON_SECRET` bearer guard → 401. `const ts = new Date().toISOString().slice(0,16).replace('T',' ');` (e.g. `2026-06-28 03:00`). `const r = await backupSpreadsheet(ts);` Load admins (`pickAdminChatIds(await listWorkers(getGateway()))`) and `await notifyAdmins(r.ok ? \`💾 Backup saved: ${r.name}\` : \`⚠️ Backup failed: ${r.reason}\`, admins)`. Return `Response.json(r)`. `runtime='nodejs'`,`dynamic='force-dynamic'`. Import depth `../../../../lib`.
- [ ] **Step 3: vercel.json** — READ it first; add to the existing `crons` array a `{ "path": "/api/cron/backup", "schedule": "0 3 * * *" }` entry (keep the existing generate-shifts cron + framework key).
- [ ] **Step 4: Verify** `pnpm --filter @scourage/web typecheck && pnpm --filter @scourage/web build` (builds with NO `BACKUP_DRIVE_FOLDER_ID` — endpoint no-ops; `/api/cron/backup` present).
- [ ] **Step 5: Commit.** `git commit -m "feat(web): nightly Drive backup of the spreadsheet (gated, Telegram-notified)"`

---

## Notes (user setup — not in this build)
Create a Google Drive folder "FlowCat Backups", **share it (Editor) with the service account** `slavery-courage@story-teller-app-01.iam.gserviceaccount.com`, copy its folder ID from the URL, and set Vercel env `BACKUP_DRIVE_FOLDER_ID = <id>`. Enable the Drive API on the project. The nightly Vercel cron (03:00) then copies the sheet there. Until set up, the endpoint returns `{ok:false, reason}` and tells admins.

## Self-Review Notes
- **Coverage:** nightly timestamped sheet copy to Drive (§16) via Vercel daily cron; Telegram success/failure notice; gated on env so it's safe before setup.
- **No new deps** (googleapis already in web). Best-effort — never throws.
