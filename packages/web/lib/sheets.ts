import 'server-only';
import { createGoogleGateway, createCachingGateway, createTtlCachingGateway, parseServiceAccountJson, createFirestoreGateway, type SheetsGateway } from '@scourage/sheets-helper';

const READ_CACHE_TTL_MS = 10_000;

let cached: SheetsGateway | null = null;

export function getGateway(): SheetsGateway {
  if (cached) return cached;
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON');
  const creds = parseServiceAccountJson(json);
  // Default 'sheets' so merging/deploying does NOT switch prod to an (empty)
  // Firestore before the one-time migration is run. Flip to Firestore by setting
  // STORAGE_BACKEND=firestore in the env AFTER migrating. Rollback = unset it.
  const backend = (process.env.STORAGE_BACKEND ?? 'sheets').toLowerCase();
  if (backend !== 'firestore' && backend !== 'sheets') {
    throw new Error(`Invalid STORAGE_BACKEND '${backend}' (expected 'firestore' or 'sheets')`);
  }

  let inner: SheetsGateway;
  if (backend === 'sheets') {
    const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
    if (!spreadsheetId) throw new Error('Missing SHEETS_SPREADSHEET_ID');
    inner = createGoogleGateway({ credentials: creds, spreadsheetId });
  } else {
    const projectId = (creds as { project_id?: string }).project_id;
    if (!projectId) throw new Error('Service-account JSON missing project_id (needed for Firestore)');
    inner = createFirestoreGateway({
      projectId,
      credentials: { client_email: creds.client_email, private_key: creds.private_key },
      rootCollection: process.env.FIRESTORE_ROOT_COLLECTION,
    });
  }
  // Cross-request read cache (writes invalidate) caps the per-minute read
  // quota during bursts of navigation; the per-instance singleton shares it.
  cached = createTtlCachingGateway(inner, READ_CACHE_TTL_MS);
  return cached;
}

/**
 * A request-scoped gateway with a read cache — use this in SERVER PAGES so each
 * Sheets tab is read once per render (kills N+1 reads that blow the Sheets
 * per-minute quota). Routes that write keep using the uncached `getGateway()`.
 */
export function getRequestGateway(): SheetsGateway {
  return createCachingGateway(getGateway());
}

export const COMPANY_TZ = process.env.COMPANY_TIMEZONE ?? 'UTC';
