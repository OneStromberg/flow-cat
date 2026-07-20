import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTtlCachingGateway } from './ttl-caching-gateway.ts';
import type { SheetsGateway } from './gateway.ts';

function countingGateway() {
  let reads = 0;
  const g: SheetsGateway = {
    async readTab() { reads += 1; return [['h'], ['a']]; },
    async writeHeaderRow() {},
    async appendRow() {},
    async updateRow() {},
    async tryClaim() { return true; },
  };
  return { g, reads: () => reads };
}

test('serves reads from cache within TTL, refetches after expiry, invalidates on write', async () => {
  const { g, reads } = countingGateway();
  let t = 1000;
  const c = createTtlCachingGateway(g, 10000, () => t);

  await c.readTab('X');
  await c.readTab('X');
  assert.equal(reads(), 1);            // within TTL → 1 backend hit

  t = 12000;                            // > TTL since first read
  await c.readTab('X');
  assert.equal(reads(), 2);            // expired → refetch

  await c.appendRow('X', ['b']);        // write invalidates X
  await c.readTab('X');
  assert.equal(reads(), 3);            // re-read after write even within TTL
});
