import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import type { Worker } from '@scourage/worklog-core';
import { loadProfileData } from './worker-profile';

const baseWorker: Worker = {
  phone: '15551230000',
  name: 'Jane',
  greeting: '',
  places: ['Site A'],
  active: true,
  teudatZeut: '',
};

test('loadProfileData passes through name + phone and reports linked when telegramChatId is set', async () => {
  const gw = createMemoryGateway();
  const worker: Worker = { ...baseWorker, telegramChatId: '999888777' };

  const data = await loadProfileData(gw, worker);

  assert.equal(data.name, 'Jane');
  assert.equal(data.phone, '15551230000');
  assert.equal(data.telegramLinked, true);
  // Already linked — no deep link should be computed even if the bot is configured.
  assert.equal(data.telegramConnectUrl, null);
});

test('loadProfileData reports not-linked with no connect url when TELEGRAM_BOT_USERNAME is unset', async () => {
  const gw = createMemoryGateway();
  const worker: Worker = { ...baseWorker, telegramChatId: undefined };

  const prev = process.env.TELEGRAM_BOT_USERNAME;
  delete process.env.TELEGRAM_BOT_USERNAME;
  try {
    const data = await loadProfileData(gw, worker);
    assert.equal(data.telegramLinked, false);
    assert.equal(data.telegramConnectUrl, null);
  } finally {
    if (prev !== undefined) process.env.TELEGRAM_BOT_USERNAME = prev;
  }
});

test('loadProfileData builds a Telegram deep link with the worker phone baked into the token when configured + unlinked', async () => {
  const gw = createMemoryGateway();
  const worker: Worker = { ...baseWorker, phone: '15559991111', telegramChatId: undefined };

  const prevBot = process.env.TELEGRAM_BOT_USERNAME;
  const prevSecret = process.env.SESSION_SECRET;
  process.env.TELEGRAM_BOT_USERNAME = 'flowcat_test_bot';
  process.env.SESSION_SECRET = 'test-secret';
  try {
    const data = await loadProfileData(gw, worker);
    assert.equal(data.telegramLinked, false);
    assert.ok(data.telegramConnectUrl);
    assert.match(data.telegramConnectUrl!, /^https:\/\/t\.me\/flowcat_test_bot\?start=/);

    // Same phone -> same token (deterministic), different phone -> different token.
    const other = await loadProfileData(gw, { ...worker, phone: '15559992222' });
    assert.notEqual(other.telegramConnectUrl, data.telegramConnectUrl);
  } finally {
    if (prevBot !== undefined) process.env.TELEGRAM_BOT_USERNAME = prevBot; else delete process.env.TELEGRAM_BOT_USERNAME;
    if (prevSecret !== undefined) process.env.SESSION_SECRET = prevSecret; else delete process.env.SESSION_SECRET;
  }
});
