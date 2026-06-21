import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseServiceAccountJson } from './credentials.ts';
import { buildSheetsAuth } from './auth.ts';

test('parses a valid service-account JSON', () => {
  const json = JSON.stringify({ client_email: 'a@b.iam', private_key: 'KEY', project_id: 'p' });
  const c = parseServiceAccountJson(json);
  assert.equal(c.client_email, 'a@b.iam');
  assert.equal(c.private_key, 'KEY');
});

test('rejects unparseable or incomplete JSON', () => {
  assert.throws(() => parseServiceAccountJson('not json'), /not parseable/);
  assert.throws(() => parseServiceAccountJson('{"client_email":"x"}'), /missing/);
});

test('buildSheetsAuth throws when neither creds nor keyFile given', () => {
  assert.throws(() => buildSheetsAuth({ spreadsheetId: 's' }), /provide keyFilePath or credentials/);
});
