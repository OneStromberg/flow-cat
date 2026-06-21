import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateToken } from './tokens.ts';

test('generates distinct url-safe tokens', () => {
  const a = generateToken();
  const b = generateToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{20,}$/);
});
