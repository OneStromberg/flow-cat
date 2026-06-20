import { google } from 'googleapis';
import type { SheetsGateway } from './gateway.ts';

export function createGoogleGateway(opts: {
  keyFilePath: string;
  spreadsheetId: string;
}): SheetsGateway {
  const auth = new google.auth.GoogleAuth({
    keyFile: opts.keyFilePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
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
  };
}
