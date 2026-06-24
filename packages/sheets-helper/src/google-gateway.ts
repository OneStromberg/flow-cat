import { google } from 'googleapis';
import type { SheetsGateway } from './gateway.ts';
import { buildSheetsAuth, type SheetsAuthOptions } from './auth.ts';

/** A read of a tab that doesn't exist yet returns this (matches memory gateway). */
function isMissingTab(err: unknown): boolean {
  const e = err as { code?: number; response?: { status?: number }; message?: string };
  const status = e?.code ?? e?.response?.status;
  const msg = e?.message ?? '';
  return status === 400 && /Unable to parse range|not found/i.test(msg);
}

export function createGoogleGateway(opts: SheetsAuthOptions): SheetsGateway {
  const sheets = google.sheets({ version: 'v4', auth: buildSheetsAuth(opts) });
  const { spreadsheetId } = opts;

  // Lazily-cached set of existing tab titles, so writes can auto-create a
  // missing tab without an extra round-trip on every call.
  let knownTabs: Set<string> | null = null;
  async function ensureTab(tab: string): Promise<void> {
    if (knownTabs === null) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
      knownTabs = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title).filter((t): t is string => !!t));
    }
    if (knownTabs.has(tab)) return;
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
      });
    } catch {
      // Tab created concurrently or already exists — safe to ignore.
    }
    knownTabs.add(tab);
  }

  return {
    async readTab(tab) {
      try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: tab });
        return (res.data.values ?? []) as string[][];
      } catch (err) {
        if (isMissingTab(err)) return [];
        throw err;
      }
    },
    async writeHeaderRow(tab, headers) {
      await ensureTab(tab);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!1:1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
    },
    async appendRow(tab, row) {
      await ensureTab(tab);
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
