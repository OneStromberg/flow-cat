# CLAUDE.md — FlowCat (slavery-courage)

Personal project (**not** the HeroCon work repo). Mobile-first worker-hours / attendance / payroll web app for a security-guard staffing company. Next.js 15 App Router on Vercel (`flow-cat.vercel.app`); repo `OneStromberg/flow-cat` (public). pnpm monorepo: `@scourage/sheets-helper`, `@scourage/worklog-core`, `@scourage/web`.

## GCP / gcloud (BLOCKING)

This project lives in GCP project **`story-teller-app-01`**, owned by **`onestromberg@gmail.com`** — **NOT** the machine's default gcloud identity (the HeroCon work account `alexs@herocon.ai`, which points at a different project). Using the default identity/project here is always wrong.

**Every `gcloud` command for this project MUST pass `--project=story-teller-app-01 --account=onestromberg@gmail.com`.** Specify these flags per-command; do **not** switch the active gcloud config (it must stay on the work account for the other repo).

- **Firestore:** named database **`slavery-courage`** in region **`me-west1`**. A `(default)` database also exists in the project — do **not** use it. Anything hitting Firestore (the app + the migration script) must set **`FIRESTORE_DATABASE_ID=slavery-courage`**.
- Service account for the app = the `client_email` inside the `GOOGLE_SERVICE_ACCOUNT_JSON` Vercel env var; that SA needs the **Cloud Datastore User** role for Firestore.

## Git / deploy

- Push to `main` **as OneStromberg** (the active `gh` account is usually the work one): `TOKEN=$(gh auth token --user OneStromberg); git push "https://OneStromberg:${TOKEN}@github.com/OneStromberg/flow-cat.git" main`.
- Commit author = `onestromberg@gmail.com` (set repo-local: `git config user.name OneStromberg; git config user.email onestromberg@gmail.com`).
- Vercel auto-deploys on push to `main`.

## Storage backend

- `STORAGE_BACKEND` env selects storage: unset/`sheets` = Google Sheets (current default), `firestore` = Firestore (needs `FIRESTORE_DATABASE_ID=slavery-courage`). Rollback = set `STORAGE_BACKEND=sheets` + redeploy. The Google Sheet is kept untouched as a backup.
