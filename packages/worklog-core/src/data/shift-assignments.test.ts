import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { addRecurring, listRecurring, removeRecurring, assignManual, listAssignments, removeAssignment, repairDuplicateAssignments } from './shift-assignments.ts';

function gw() {
  return createMemoryGateway({
    RecurringAssignments: [['template_id','employee_phone','active','created_at']],
    ShiftAssignments: [['instance_id','employee_phone','source','status','assigned_at','assigned_by']],
  });
}

test('recurring add/list/remove', async () => {
  const g = gw();
  await addRecurring(g, 'tpl_1', '15551230000');
  let r = await listRecurring(g, 'tpl_1');
  assert.equal(r.length, 1); assert.equal(r[0].employeePhone, '15551230000'); assert.equal(r[0].active, true);
  await removeRecurring(g, 'tpl_1', '15551230000');
  r = await listRecurring(g, 'tpl_1');
  assert.equal(r.filter((x) => x.active).length, 0);
});

test('manual assign/list/remove (status filtered)', async () => {
  const g = gw();
  await assignManual(g, 'tpl_1_20260701', '15551230000', 'admin');
  let a = await listAssignments(g, { instanceId: 'tpl_1_20260701' });
  assert.equal(a.length, 1); assert.equal(a[0].status, 'assigned');
  await removeAssignment(g, 'tpl_1_20260701', '15551230000');
  a = await listAssignments(g, { instanceId: 'tpl_1_20260701' });
  assert.equal(a.length, 0);
});

test('assignManual writes an optional rate and defaults empty', async () => {
  const g = createMemoryGateway({ ShiftAssignments: [['instance_id','employee_phone','source','status','assigned_at','assigned_by','rate']] });
  await assignManual(g, 'i1', 'p1', 'admin', '48');
  await assignManual(g, 'i1', 'p2', 'admin'); // no rate
  const a = await listAssignments(g, { instanceId: 'i1' });
  assert.equal(a.find((x) => x.employeePhone === 'p1')?.rate, '48');
  assert.equal(a.find((x) => x.employeePhone === 'p2')?.rate, '');
});

test('assignManual reactivates a removed row instead of appending a duplicate', async () => {
  const g = createMemoryGateway({ ShiftAssignments: [
    ['instance_id','employee_phone','source','status','assigned_at','assigned_by','rate'],
    ['i1','p1','manual','removed','2026-07-01T00:00:00.000Z','admin',''],
  ]});
  await assignManual(g, 'i1', 'p1', 'admin');
  const a = (await listAssignments(g, { instanceId: 'i1' })).filter((x) => x.employeePhone === 'p1');
  assert.equal(a.filter((x) => x.status === 'assigned').length, 1);
  assert.equal((await g.readTab('ShiftAssignments')).length, 2); // header + 1 row, no append
});

test('repairDuplicateAssignments collapses multiple assigned rows to one', async () => {
  const g = createMemoryGateway({ ShiftAssignments: [
    ['instance_id','employee_phone','source','status','assigned_at','assigned_by','rate'],
    ['i1','p1','manual','assigned','2026-07-01T00:00:00.000Z','admin',''],
    ['i1','p1','recurring','assigned','2026-07-02T00:00:00.000Z','seed',''],
  ]});
  const r = await repairDuplicateAssignments(g);
  assert.equal(r.collapsed, 1);
  const active = (await listAssignments(g, { instanceId: 'i1' })).filter((x) => x.status === 'assigned' && x.employeePhone === 'p1');
  assert.equal(active.length, 1);
});
