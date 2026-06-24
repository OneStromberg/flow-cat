import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLinkToken, verifyLinkToken } from './telegram-link.ts';
test('link token round-trips and rejects tampering', () => {
  const key = 'test-key';
  const tok = makeLinkToken('15551230000', key);
  assert.match(tok, /^[A-Za-z0-9_-]+$/);     // base64url-safe (Telegram start param)
  assert.equal(verifyLinkToken(tok, key), '15551230000');
  assert.equal(verifyLinkToken(tok, 'wrong-key'), null);
  assert.equal(verifyLinkToken(tok + 'x', key), null);
  assert.equal(verifyLinkToken('garbage', key), null);
});
