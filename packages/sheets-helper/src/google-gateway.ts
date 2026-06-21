import { google } from 'googleapis';
import type { SheetsGateway } from './gateway.ts';
import { buildSheetsAuth, type SheetsAuthOptions } from './auth.ts';

export function createGoogleGateway(opts: SheetsAuthOptions): SheetsGateway {
  const sheets = google.sheets({ version: 'v4', auth: buildSheetsAuth(opts) });
  const { spreadsheetId } = opts;

  return {
    async readTab(tab) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: tab });
      return (res.data.values ?? []) as string[][];
    },
    async writeHeaderRow(tab, headers) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!1:1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
    },
    async appendRow(tab, row) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: tab,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      });
    },
    async updateRow(tab, rowNumber, row) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
    },
  };
}
