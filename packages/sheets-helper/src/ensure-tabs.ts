import { google } from 'googleapis';
import { buildSheetsAuth, type SheetsAuthOptions } from './auth.ts';

/**
 * Ensure each named tab exists, creating any that are missing.
 * Returns the list of tabs that were created.
 */
export async function ensureTabs(opts: SheetsAuthOptions, tabs: string[]): Promise<string[]> {
  const sheets = google.sheets({ version: 'v4', auth: buildSheetsAuth(opts) });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: opts.spreadsheetId });
  const existing = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
  const toCreate = tabs.filter((t) => !existing.has(t));
  if (toCreate.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: opts.spreadsheetId,
      requestBody: { requests: toCreate.map((title) => ({ addSheet: { properties: { title } } })) },
    });
  }
  return toCreate;
}
