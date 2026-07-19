import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertOk, UnauthorizedError } from './swr-fetcher';

test('assertOk: 200 is a no-op', () => {
  assert.doesNotThrow(() => assertOk(200));
});

test('assertOk: 401 throws UnauthorizedError', () => {
  assert.throws(() => assertOk(401), UnauthorizedError);
});

test('assertOk: 500 throws a generic Error (not UnauthorizedError)', () => {
  assert.throws(() => assertOk(500), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.ok(!(err instanceof UnauthorizedError));
    return true;
  });
});
