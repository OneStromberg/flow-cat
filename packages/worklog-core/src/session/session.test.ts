import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, readSession } from './session.ts';

const key = 'signing-key';

test('roundtrips a phone', () => {
  const v = createSession('15551230000', key);
  assert.deepEqual(readSession(v, key), { phone: '15551230000' });
});

test('rejects wrong key, tampered value, and garbage', () => {
  const v = createSession('15551230000', key);
  assert.equal(readSession(v, 'other-key'), null);
  assert.equal(readSession(v.slice(0, -2) + 'xx', key), null);
  assert.equal(readSession('garbage', key), null);
  assert.equal(readSession('', key), null);
});
