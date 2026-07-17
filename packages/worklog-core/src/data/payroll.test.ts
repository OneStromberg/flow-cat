import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { resolveHourlyRate, resolveAssignmentRate, computePay, addAdjustment, listAdjustments } from './payroll.ts';

test('resolveHourlyRate precedence: employee > template > location > 0', () => {
  assert.equal(resolveHourlyRate('50', '40', '30'), 50);
  assert.equal(resolveHourlyRate('', '40', '30'), 40);
  assert.equal(resolveHourlyRate('', '', '30'), 30);
  assert.equal(resolveHourlyRate('', '', ''), 0);
  assert.equal(resolveHourlyRate('0', '40', '30'), 40); // 0 is not a valid rate, fall through
});

test('resolveAssignmentRate prefers assignment, then employee/template/location', () => {
  assert.equal(resolveAssignmentRate('55', '40', '30', '20'), 55);
  assert.equal(resolveAssignmentRate('', '40', '30', '20'), 40);
  assert.equal(resolveAssignmentRate('', '', '30', '20'), 30);
  assert.equal(resolveAssignmentRate('', '', '', '20'), 20);
  assert.equal(resolveAssignmentRate('', '', '', ''), 0);
  assert.equal(resolveAssignmentRate('0', '40', '', ''), 40); // 0 is not an override
});
test('resolveAssignmentRate: negative string, non-numeric string, and "0" are all treated as no override', () => {
  // Negative strings are not a valid rate (pos() requires n > 0) → falls through
  assert.equal(resolveAssignmentRate('-10', '40', '30', '20'), 40);
  assert.equal(resolveAssignmentRate('-10', '', '', ''), 0);
  // Non-numeric strings are not finite → falls through
  assert.equal(resolveAssignmentRate('abc', '40', '30', '20'), 40);
  assert.equal(resolveAssignmentRate('abc', '', '', ''), 0);
  // '0' is explicitly treated as "no override", same as blank
  assert.equal(resolveAssignmentRate('0', '', '30', '20'), 30);
  assert.equal(resolveAssignmentRate('0', '0', '0', '20'), 20);
});

test('computePay hourly = sum(hours*rate) + bonuses - penalties', () => {
  const items = [{ date:'2026-07-01', hours:8, rate:50 }, { date:'2026-07-02', hours:4, rate:50 }];
  const adj = [{ id:'a', employeePhone:'1', date:'2026-07-01', type:'bonus', amount:100, reason:'x' },
               { id:'b', employeePhone:'1', date:'2026-07-02', type:'penalty', amount:30, reason:'y' }];
  const r = computePay('hourly', 0, items, adj);
  assert.equal(r.gross, 600); assert.equal(r.bonuses, 100); assert.equal(r.penalties, 30); assert.equal(r.net, 670);
});
test('computePay structures', () => {
  const items = [{date:'2026-07-01',hours:8,rate:0},{date:'2026-07-01',hours:4,rate:0},{date:'2026-07-02',hours:8,rate:0}];
  assert.equal(computePay('fixed_shift', 200, items, []).gross, 600); // 3 shifts * 200
  assert.equal(computePay('per_day', 300, items, []).gross, 600);     // 2 distinct dates * 300
  assert.equal(computePay('monthly', 8000, items, []).gross, 8000);   // flat
  assert.equal(computePay('piece', 0, items, []).gross, 0);
  assert.equal(computePay('piece', 0, items, []).basis, 'manual');
});
test('addAdjustment validates and stores; listAdjustments filters by date', async () => {
  const g = createMemoryGateway({ Adjustments: [['id','employee_phone','date','type','amount','reason','created_by','created_at']] });
  const bad = await addAdjustment(g, { employeePhone:'', date:'2026-07-01', type:'bonus', amount:'10', reason:'x', createdBy:'admin' });
  assert.equal(bad.ok, false);
  const ok = await addAdjustment(g, { employeePhone:'15551230000', date:'2026-07-05', type:'penalty', amount:'25', reason:'late', createdBy:'admin' });
  assert.equal(ok.ok, true);
  const inRange = await listAdjustments(g, { employeePhone:'15551230000', from:'2026-07-01', to:'2026-07-31' });
  assert.equal(inRange.length, 1); assert.equal(inRange[0].amount, 25); assert.equal(inRange[0].type, 'penalty');
  const outRange = await listAdjustments(g, { from:'2026-08-01', to:'2026-08-31' });
  assert.equal(outRange.length, 0);
});
