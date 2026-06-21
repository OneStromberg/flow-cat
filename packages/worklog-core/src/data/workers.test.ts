import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { findWorker, findWorkerByToken, authenticateWorker } from './workers.ts';

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

test('validates worker places against master Places tab; drops typos', async () => {
  const g = createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active'],
      ['+1 555-123-0001', 'Alice', '', 'Warehouse, Offce HQ', 'yes'],
    ],
    Places: [
      ['place_name', 'active'],
      ['Warehouse', 'yes'],
      ['Office HQ', 'yes'],
    ],
  });
  const w = await findWorker(g, '15551230001');
  assert.deepEqual(w?.places, ['Warehouse']);
});

test('finds worker by token', async () => {
  const g = createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active', 'token'],
      ['15551230000', 'John', '', 'Warehouse', 'yes', 'abc123'],
    ],
  });
  const w = await findWorkerByToken(g, 'abc123');
  assert.equal(w?.name, 'John');
  assert.equal(w?.token, 'abc123');
  assert.equal(await findWorkerByToken(g, 'nope'), null);
  assert.equal(await findWorkerByToken(g, ''), null);
});

test('parses teudat_zeut and authenticates by phone + teudat', async () => {
  const g = createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active', 'teudat_zeut'],
      ['15551230000', 'John', '', 'Warehouse', 'yes', '123456782'],
    ],
  });
  const ok = await authenticateWorker(g, '+1 555-123-0000', '123456782');
  assert.equal(ok?.name, 'John');
  assert.equal(ok?.teudatZeut, '123456782');
  assert.equal(await authenticateWorker(g, '15551230000', '999999999'), null); // wrong teudat
  assert.equal(await authenticateWorker(g, '10000000000', '123456782'), null); // wrong phone
});
