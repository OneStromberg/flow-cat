import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { addWorker, updateWorker } from './add-worker.ts';
import { findWorker } from './workers.ts';

const base = {
  phone: '+1 555-222-0000', teudatZeut: '987654321', name: 'New Guy',
  places: ['Warehouse'], city: 'Eilat', age: '30',
  transportation: 'car', hebrewLevel: 'speaks_good', payType: 'full', payAmount: '', schedule: 'days', gender: '',
  payStructure: '', payRate: '',
};

test('adds a valid worker (header-aligned row, active=yes)', async () => {
  const g = createMemoryGateway({ Workers: [['phone', 'name', 'active']] });
  const r = await addWorker(g, base);
  assert.deepEqual(r, { ok: true });
  const rows = g.dump().Workers;
  const header = rows[0];
  const row = rows[1];
  const get = (k: string) => row[header.indexOf(k)];
  assert.equal(get('phone'), '15552220000');
  assert.equal(get('name'), 'New Guy');
  assert.equal(get('active'), 'yes');
  assert.equal(get('teudat_zeut'), '987654321');
  assert.equal(get('transportation'), 'car');
  assert.equal(get('schedule'), 'days');
});

test('flags required-missing, bad enum, non-numeric age', async () => {
  const g = createMemoryGateway({ Workers: [['phone', 'name']] });
  const r = await addWorker(g, { ...base, phone: '', name: '', transportation: 'plane', age: 'old' });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.phone && r.errors.name && r.errors.transportation && r.errors.age);
  }
});

test('requires pay_amount only when pay_type=amount', async () => {
  const g = createMemoryGateway({ Workers: [['phone', 'name']] });
  const bad = await addWorker(g, { ...base, payType: 'amount', payAmount: '' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.errors.payAmount);
  const ok = await addWorker(g, { ...base, phone: '15553330000', payType: 'amount', payAmount: '5000' });
  assert.deepEqual(ok, { ok: true });
});

test('rejects a duplicate phone', async () => {
  const g = createMemoryGateway({ Workers: [['phone', 'name'], ['15552220000', 'Existing']] });
  const r = await addWorker(g, base); // base phone normalizes to 15552220000
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errors.phone, /already exists/);
});

test('updateWorker edits an existing worker by phone (incl pay structure)', async () => {
  const g = createMemoryGateway({ Workers: [
    ['phone','name','places','active','teudat_zeut','admin','pay_structure','pay_rate'],
    ['972501234567','Ilya','Lod','yes','9','','monthly','37'],
  ]});
  const r = await updateWorker(g, '0501234567', {
    teudatZeut:'9', name:'Ilya', places:['Lod'], city:'', age:'', transportation:'', hebrewLevel:'',
    payType:'', payAmount:'', schedule:'', gender:'', payStructure:'hourly', payRate:'37', active:true, admin:false,
  });
  assert.equal(r.ok, true);
  const w = await findWorker(g, '972501234567');
  assert.equal(w?.payStructure, 'hourly'); assert.equal(w?.payRate, '37'); assert.equal(w?.active, true);
  const miss = await updateWorker(g, '10000000000', { /* ...same shape... */ } as any);
  assert.equal(miss.ok, false);
});

test('addWorker accepts a valid gender and rejects an invalid one', async () => {
  const g = createMemoryGateway({ Workers: [['phone','name','places','active']] });
  const ok = await addWorker(g, { phone: '15551112222', teudatZeut: '1', name: 'A', places: [], city: '', age: '', transportation: '', hebrewLevel: '', payType: '', payAmount: '', schedule: '', gender: 'male', payStructure: '', payRate: '' });
  assert.deepEqual(ok, { ok: true });
  const bad = await addWorker(g, { phone: '15553334444', teudatZeut: '1', name: 'B', places: [], city: '', age: '', transportation: '', hebrewLevel: '', payType: '', payAmount: '', schedule: '', gender: 'zzz', payStructure: '', payRate: '' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.errors.gender, 'Invalid');
});
