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
