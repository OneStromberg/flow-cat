import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySignature } from './verify-signature.ts';

const secret = 'app-secret';
const body = '{"hello":"world"}';
const good = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

test('accepts a correct signature', () => {
  assert.equal(verifySignature(body, good, secret), true);
});

test('rejects wrong/missing signatures', () => {
  assert.equal(verifySignature(body, 'sha256=deadbeef', secret), false);
  assert.equal(verifySignature(body, undefined, secret), false);
});
