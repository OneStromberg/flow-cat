import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { findWorker, findWorkerByToken, authenticateWorker, listWorkers, parseWorker } from './workers.ts';

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

test('never authenticates a worker whose stored teudat_zeut is empty', async () => {
  const g = createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active', 'teudat_zeut'],
      ['15551230000', 'NoTeudat', '', 'Warehouse', 'yes', ''],
    ],
  });
  assert.equal(await authenticateWorker(g, '15551230000', ''), null);
  assert.equal(await authenticateWorker(g, '15551230000', '123456782'), null);
});

test('parses admin + profile fields and lists all workers', async () => {
  const g = createMemoryGateway({
    Places: [['place_name', 'active'], ['Warehouse', 'yes']],
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active', 'teudat_zeut', 'admin', 'city', 'age', 'transportation', 'hebrew_level', 'pay_type', 'pay_amount', 'schedule'],
      ['15551230000', 'Boss', '', 'Warehouse', 'yes', '111', 'yes', 'Tel Aviv', '40', 'car', 'read_write', 'full', '', 'all'],
      ['15559990000', 'Dan', '', 'Warehouse', 'yes', '222', '', 'Haifa', '25', 'electric_bicycle', 'mid', 'amount', '4500', 'nights'],
    ],
  });
  const all = await listWorkers(g);
  assert.equal(all.length, 2);
  const boss = all.find((w) => w.name === 'Boss')!;
  assert.equal(boss.admin, true);
  assert.equal(boss.city, 'Tel Aviv');
  assert.equal(boss.transportation, 'car');
  assert.equal(boss.schedule, 'all');
  const dan = all.find((w) => w.name === 'Dan')!;
  assert.equal(dan.admin, false);
  assert.equal(dan.payType, 'amount');
  assert.equal(dan.payAmount, '4500');
});

test('listWorkers returns RAW worker places (no master filtering) for admin views', async () => {
  const g = createMemoryGateway({
    Places: [['place_name', 'active'], ['Warehouse', 'yes']], // master has only Warehouse
    Workers: [
      ['phone', 'name', 'places', 'active'],
      ['15551230000', 'A', 'Warehouse, New Site', 'yes'],
    ],
  });
  const all = await listWorkers(g);
  // 'New Site' is NOT in the master Places tab, but the admin view must still show it
  assert.deepEqual(all[0].places, ['Warehouse', 'New Site']);
});

test('parseWorker reads gender', () => {
  const w = parseWorker({ phone: '15551230000', name: 'A', places: '', active: 'yes', gender: 'female' }, []);
  assert.equal(w.gender, 'female');
});
