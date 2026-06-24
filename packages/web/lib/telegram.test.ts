import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickAdminChatIds, buildSendUrl } from './telegram.ts';

test('pickAdminChatIds returns only admins with a linked chat id', () => {
  const ws = [
    { admin: true, telegramChatId: '111' },
    { admin: true, telegramChatId: '' },      // admin but not linked
    { admin: false, telegramChatId: '222' },  // linked but not admin
    { admin: true, telegramChatId: ' 333 ' },
  ] as any;
  assert.deepEqual(pickAdminChatIds(ws), ['111', '333']);
  assert.deepEqual(pickAdminChatIds([]), []);
});
test('buildSendUrl builds the telegram endpoint', () => {
  assert.equal(buildSendUrl('TOK'), 'https://api.telegram.org/botTOK/sendMessage');
});
