import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCachingGateway } from './caching-gateway.ts';
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

test('caches reads per tab; a write invalidates that tab', async () => {
  const { g, reads } = countingGateway();
  const c = createCachingGateway(g);
  await c.readTab('X');
  await c.readTab('X');
  await c.readTab('X');
  assert.equal(reads(), 1); // 3 reads → 1 backend hit

  await c.readTab('Y'); // different tab → its own read
  assert.equal(reads(), 2);

  await c.appendRow('X', ['b']); // invalidate X
  await c.readTab('X');
  assert.equal(reads(), 3); // X re-read after write
  await c.readTab('Y');
  assert.equal(reads(), 3); // Y still cached
});
