import { google } from 'googleapis';

/**
 * Ensure each named tab exists in the spreadsheet, creating any that are
 * missing. Returns the list of tabs that were created. Tab creation is the
 * one Sheets operation outside the row-level SheetsGateway, so it lives here.
 */
export async function ensureTabs(
  opts: { keyFilePath: string; spreadsheetId: string },
  tabs: string[],
): Promise<string[]> {
  const auth = new google.auth.GoogleAuth({
    keyFile: opts.keyFilePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: opts.spreadsheetId });
  const existing = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
  const toCreate = tabs.filter((t) => !existing.has(t));
  if (toCreate.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: opts.spreadsheetId,
      requestBody: {
        requests: toCreate.map((title) => ({ addSheet: { properties: { title } } })),
      },
    });
  }
  return toCreate;
}
