import 'server-only';
import { createGoogleGateway, createCachingGateway, createTtlCachingGateway, parseServiceAccountJson, type SheetsGateway } from '@scourage/sheets-helper';

const READ_CACHE_TTL_MS = 10_000;

let cached: SheetsGateway | null = null;

export function getGateway(): SheetsGateway {
  if (cached) return cached;
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!json) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!spreadsheetId) throw new Error('Missing SHEETS_SPREADSHEET_ID');
  // Cross-request read cache (writes invalidate) caps the Sheets per-minute read
  // quota during bursts of navigation; the per-instance singleton shares it.
  cached = createTtlCachingGateway(
    createGoogleGateway({ credentials: parseServiceAccountJson(json), spreadsheetId }),
    READ_CACHE_TTL_MS,
  );
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
