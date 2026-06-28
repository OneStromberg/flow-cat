import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { addLeave, listLeave, setLeaveStatus, isOnLeave } from './leave.ts';

function gw() {
  return createMemoryGateway({ Leave: [['id', 'employee_phone', 'type', 'from', 'to', 'status', 'reason', 'created_by', 'created_at']] });
}

test('addLeave validates + stores as pending; listLeave + status flip', async () => {
  const g = gw();
  const bad = await addLeave(g, { employeePhone: '', type: 'vacation', from: '2026-07-10', to: '2026-07-05', reason: '', createdBy: 'admin' });
  assert.equal(bad.ok, false); // empty phone + from>to
  const r = await addLeave(g, { employeePhone: '972501234567', type: 'vacation', from: '2026-07-05', to: '2026-07-10', reason: 'trip', createdBy: 'admin' });
  assert.equal(r.ok, true);
  let l = await listLeave(g, { employeePhone: '972501234567' });
  assert.equal(l.length, 1);
  assert.equal(l[0].status, 'pending');
  await setLeaveStatus(g, r.ok ? r.id : '', 'approved');
  l = await listLeave(g, { status: 'approved' });
  assert.equal(l.length, 1);
});

test('isOnLeave only counts approved leave covering the date', () => {
  const leaves = [
    { id: '1', employeePhone: 'p', type: 'vacation', from: '2026-07-05', to: '2026-07-10', status: 'approved', reason: '' },
    { id: '2', employeePhone: 'p', type: 'sick', from: '2026-08-01', to: '2026-08-02', status: 'pending', reason: '' },
  ] as any;
  assert.equal(isOnLeave(leaves, 'p', '2026-07-07'), true);
  assert.equal(isOnLeave(leaves, 'p', '2026-07-11'), false);
  assert.equal(isOnLeave(leaves, 'p', '2026-08-01'), false); // pending, not approved
});

test('listLeave range overlap filter', async () => {
  const g = gw();
  await addLeave(g, { employeePhone: 'p', type: 'vacation', from: '2026-07-05', to: '2026-07-10', reason: '', createdBy: 'a' });
  assert.equal((await listLeave(g, { from: '2026-07-08', to: '2026-07-20' })).length, 1); // overlaps
  assert.equal((await listLeave(g, { from: '2026-08-01', to: '2026-08-31' })).length, 0); // no overlap
});
