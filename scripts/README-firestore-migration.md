# Firestore Migration Runbook

One-time migration of all Google Sheets data into Firestore.

---

## ⚠️ Run-once warning

The migration script is **NOT idempotent**. `appendRow` increments the row counter on every call. Re-running against a collection that already has data will **duplicate every row**.

- Run it exactly **once**, against an empty Firestore root collection.
- If you need to re-run (e.g. after a Sheets update), **delete the root collection first** (delete all documents under `sheets/` in the Firestore console, or use `firebase firestore:delete --recursive sheets`), then run the script again.

---

## Prerequisites

1. **Enable Firestore** (Native mode) on the GCP project via the [Cloud Console](https://console.cloud.google.com/firestore).

2. **Grant the service account `roles/datastore.user`**:
   ```bash
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:YOUR_SA_EMAIL" \
     --role="roles/datastore.user"
   ```
   The service account email is the `client_email` field in your service-account JSON.

---

## Run the migration

From the **repository root** (`slavery-courage/`):

```bash
GOOGLE_SERVICE_ACCOUNT_JSON='<paste full service-account JSON here>' \
SHEETS_SPREADSHEET_ID='<your spreadsheet ID>' \
pnpm tsx scripts/migrate-sheets-to-firestore.ts
```

Optional — override the Firestore root collection (default: `sheets`):

```bash
GOOGLE_SERVICE_ACCOUNT_JSON='...' \
SHEETS_SPREADSHEET_ID='...' \
FIRESTORE_ROOT_COLLECTION='my-collection' \
pnpm tsx scripts/migrate-sheets-to-firestore.ts
```

The script will:
- Read all 13 tabs from the spreadsheet in order.
- Write the header row (row 1) and then append each data row to Firestore, preserving row order and the `_row` counter.
- Print a per-tab summary and exit 0 on success, 1 if any tab failed.

---

## Tabs migrated (in order)

| Tab | Description |
|---|---|
| Workers | Worker records |
| Places | Work locations |
| Cities | City list |
| ShiftTemplates | Shift template definitions |
| RecurringAssignments | Recurring shift assignments |
| ShiftInstances | Individual shift instances |
| ShiftAssignments | Worker-to-shift assignments |
| Attendance | Attendance records |
| Alerts | Alert log |
| Adjustments | Pay adjustments |
| Leave | Leave records |
| Questions | Worker questions |
| WorkLogs | Work log entries |

---

## After migration — flip the storage backend

1. In Vercel, set:
   - `STORAGE_BACKEND=firestore`
   - `FIRESTORE_ROOT_COLLECTION=sheets` *(only needed if you used a non-default collection name)*
2. Redeploy the web app.
3. Verify the app reads data correctly.

---

## Rollback

Set `STORAGE_BACKEND=sheets` in Vercel and redeploy. The Google Sheet is left **untouched** throughout the migration — it remains a full backup and the app will read from it again immediately.

---

## Re-run (if needed)

If you need to re-migrate after further changes to the Sheet:

```bash
# 1. Delete the Firestore collection (Firebase CLI)
npx firebase firestore:delete --recursive sheets --project YOUR_PROJECT_ID

# 2. Re-run the migration script
GOOGLE_SERVICE_ACCOUNT_JSON='...' \
SHEETS_SPREADSHEET_ID='...' \
pnpm tsx scripts/migrate-sheets-to-firestore.ts
```
