import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSigningKey } from './signing-key.ts';

test('SESSION_SECRET wins when set', () => {
  assert.equal(deriveSigningKey('explicit-secret', '{"private_key":"PK"}'), 'explicit-secret');
});

test('derives a stable non-empty key from the service-account json when no SESSION_SECRET', () => {
  const a = deriveSigningKey(undefined, '{"client_email":"x","private_key":"PK"}');
  const b = deriveSigningKey(undefined, '{"client_email":"x","private_key":"PK"}');
  assert.equal(a, b);
  assert.ok(a.length > 20);
});
