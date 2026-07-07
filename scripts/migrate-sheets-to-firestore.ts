/**
 * ONE-TIME migration: Google Sheets → Firestore.
 *
 * Run ONCE against an empty Firestore. The script is NOT idempotent for
 * existing data — appendRow increments the row counter on every call, so
 * re-running against a non-empty collection will duplicate every row.
 *
 * ⚠️  TO RE-RUN: delete the entire root Firestore collection (e.g. "sheets")
 *     first, then execute this script again.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — full service-account JSON (as a string)
 *   SHEETS_SPREADSHEET_ID        — the source Google Sheets spreadsheet ID
 *
 * Optional env vars:
 *   FIRESTORE_ROOT_COLLECTION    — Firestore collection name (default: "sheets")
 */

import {
  parseServiceAccountJson,
  createGoogleGateway,
  createFirestoreGateway,
} from '@scourage/sheets-helper';

// ---------------------------------------------------------------------------
// Env guard — fail fast with a clear message
// ---------------------------------------------------------------------------

const rawCreds = process.env['GOOGLE_SERVICE_ACCOUNT_JSON'];
const spreadsheetId = process.env['SHEETS_SPREADSHEET_ID'];

if (!rawCreds) {
  console.error('ERROR: GOOGLE_SERVICE_ACCOUNT_JSON env var is required.');
  process.exit(1);
}
if (!spreadsheetId) {
  console.error('ERROR: SHEETS_SPREADSHEET_ID env var is required.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parse credentials
// ---------------------------------------------------------------------------

const creds = parseServiceAccountJson(rawCreds);

// ServiceAccountCredentials has [k: string]: unknown; project_id is always
// present in a real service-account JSON.
const projectId = creds['project_id'];
if (typeof projectId !== 'string' || !projectId) {
  console.error('ERROR: service-account JSON is missing project_id.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Gateway setup
// ---------------------------------------------------------------------------

const sheetsGw = createGoogleGateway({ credentials: creds, spreadsheetId });

const fsGw = createFirestoreGateway({
  projectId,
  credentials: {
    client_email: creds.client_email,
    private_key: creds.private_key,
  },
  rootCollection: process.env['FIRESTORE_ROOT_COLLECTION'],
});

// ---------------------------------------------------------------------------
// Tabs to migrate (in order)
// ---------------------------------------------------------------------------

const TABS = [
  'Workers',
  'Places',
  'Cities',
  'ShiftTemplates',
  'RecurringAssignments',
  'ShiftInstances',
  'ShiftAssignments',
  'Attendance',
  'Alerts',
  'Adjustments',
  'Leave',
  'Questions',
  'WorkLogs',
];

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

let failed = 0;

console.log(`Starting migration of ${TABS.length} tabs from Sheets → Firestore...`);
console.log(`  spreadsheetId: ${spreadsheetId}`);
console.log(`  projectId: ${projectId}`);
console.log(`  rootCollection: ${process.env['FIRESTORE_ROOT_COLLECTION'] ?? 'sheets'}`);
console.log('');

for (const tab of TABS) {
  try {
    const rows = await sheetsGw.readTab(tab);

    if (!rows.length) {
      console.log(`${tab}: empty, skipped`);
      continue;
    }

    // Write header row (row 1) — sets the Firestore counter to 1.
    await fsGw.writeHeaderRow(tab, rows[0]!);

    // Append each data row in order.  appendRow uses a Firestore transaction
    // to atomically increment the counter, preserving row order.
    for (let i = 1; i < rows.length; i++) {
      await fsGw.appendRow(tab, rows[i]!);
    }

    console.log(`${tab}: migrated ${rows.length - 1} data rows`);
  } catch (err) {
    console.error(`${tab}: FAILED — ${(err as Error).message}`);
    failed++;
  }
}

console.log('');
if (failed === 0) {
  console.log(`Migration complete. All ${TABS.length} tabs processed successfully.`);
} else {
  console.log(`Migration finished with ${failed} tab(s) failed. Check errors above.`);
}

process.exit(failed ? 1 : 0);
