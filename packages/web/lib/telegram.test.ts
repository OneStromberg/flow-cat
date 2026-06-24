import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminChatIds, buildSendUrl } from './telegram.ts';

test('adminChatIds parses comma list and trims', () => {
  assert.deepEqual(adminChatIds('111, 222 ,333'), ['111','222','333']);
  assert.deepEqual(adminChatIds(''), []);
  assert.deepEqual(adminChatIds(undefined), []);
});
test('buildSendUrl builds the telegram endpoint', () => {
  assert.equal(buildSendUrl('TOK'), 'https://api.telegram.org/botTOK/sendMessage');
});
