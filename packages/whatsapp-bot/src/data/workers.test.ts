import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { findWorker } from './workers.ts';

const gw = () =>
  createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active'],
      ['+1 555-123-0000', 'John', '', 'Warehouse, Office HQ', 'yes'],
      ['15559999999', 'Ghost', '', 'Site', 'no'],
    ],
  });

test('finds worker by normalized phone and parses places', async () => {
  const w = await findWorker(gw(), '15551230000');
  assert.equal(w?.name, 'John');
  assert.deepEqual(w?.places, ['Warehouse', 'Office HQ']);
  assert.equal(w?.active, true);
});

test('inactive worker marked active=false; unknown phone null', async () => {
  assert.equal((await findWorker(gw(), '15559999999'))?.active, false);
  assert.equal(await findWorker(gw(), '10000000000'), null);
});
