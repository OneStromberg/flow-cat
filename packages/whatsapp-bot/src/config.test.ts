import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.ts';

const base = {
  WHATSAPP_TRANSPORT: 'console',
  SHEETS_SPREADSHEET_ID: 'sheet1',
  GOOGLE_APPLICATION_CREDENTIALS: './k.json',
  COMPANY_TIMEZONE: 'Asia/Jerusalem',
  LOCAL_WORKER_PHONE: '15551230000',
};

test('loads console config without cloud vars', () => {
  const c = loadConfig({ ...base });
  assert.equal(c.transport, 'console');
  assert.equal(c.spreadsheetId, 'sheet1');
  assert.equal(c.timezone, 'Asia/Jerusalem');
});

test('throws when a required var is missing', () => {
  const { SHEETS_SPREADSHEET_ID, ...rest } = base;
  assert.throws(() => loadConfig(rest), /SHEETS_SPREADSHEET_ID/);
});

test('cloud transport requires cloud vars', () => {
  assert.throws(
    () => loadConfig({ ...base, WHATSAPP_TRANSPORT: 'cloud' }),
    /WHATSAPP_TOKEN/,
  );
});
