import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { generateInstances, listInstances, cancelInstance } from './shift-instances.ts';
import { listAssignments } from './shift-assignments.ts';

function seed() {
  return createMemoryGateway({
    ShiftTemplates: [
      ['id', 'location', 'label', 'days', 'start', 'end', 'headcount', 'valid_from', 'valid_to', 'active'],
      ['tpl_1', 'Site A', 'Night', 'Wed', '22:00', '06:00', '2', '', '', 'yes'],
    ],
    RecurringAssignments: [
      ['template_id', 'employee_phone', 'active', 'created_at'],
      ['tpl_1', '15551230000', 'yes', ''],
    ],
    ShiftInstances: [['id', 'template_id', 'location', 'date', 'start', 'end', 'headcount', 'status', 'generated_at']],
    ShiftAssignments: [['instance_id', 'employee_phone', 'source', 'status', 'assigned_at', 'assigned_by']],
  });
}

test('generates weekday instances within horizon, idempotent, seeds recurring', async () => {
  const g = seed();
  const r1 = await generateInstances(g, '2026-07-01', 14); // Wed
  assert.equal(r1.instancesCreated, 2); // 07-01, 07-08
  const ins = await listInstances(g, { from: '2026-07-01', to: '2026-07-31' });
  assert.deepEqual(
    ins.map((i) => i.id).sort(),
    ['tpl_1_20260701', 'tpl_1_20260708'],
  );
  assert.equal(ins[0].end, '06:00');
  const a = await listAssignments(g, { instanceId: 'tpl_1_20260701' });
  assert.equal(a.length, 1);
  assert.equal(a[0].source, 'recurring');
  const r2 = await generateInstances(g, '2026-07-01', 14);
  assert.equal(r2.instancesCreated, 0);
  assert.equal(r2.assignmentsSeeded, 0);
});

test('clips to valid_from', async () => {
  const g = seed();
  // mutate template valid_from to exclude 07-01
  const rows = g.dump().ShiftTemplates;
  rows[1][rows[0].indexOf('valid_from')] = '2026-07-08';
  const r = await generateInstances(g, '2026-07-01', 14);
  assert.equal(r.instancesCreated, 1);
  const ins = await listInstances(g, { from: '2026-07-01', to: '2026-07-31' });
  assert.deepEqual(
    ins.map((i) => i.id),
    ['tpl_1_20260708'],
  );
});

test('overnight instance keeps end time', async () => {
  const g = seed();
  await generateInstances(g, '2026-07-01', 7);
  const ins = await listInstances(g, { from: '2026-07-01', to: '2026-07-07' });
  assert.equal(ins.length, 1);
  assert.equal(ins[0].end, '06:00');
  assert.equal(ins[0].start, '22:00');
});

test('listInstances filters by location', async () => {
  const g = seed();
  await generateInstances(g, '2026-07-01', 7);
  const all = await listInstances(g, { from: '2026-07-01', to: '2026-07-07' });
  assert.equal(all.length, 1);
  const filtered = await listInstances(g, { from: '2026-07-01', to: '2026-07-07', location: 'Site B' });
  assert.equal(filtered.length, 0);
});

test('cancelInstance sets status to cancelled', async () => {
  const g = seed();
  await generateInstances(g, '2026-07-01', 7);
  const ins = await listInstances(g, { from: '2026-07-01', to: '2026-07-07' });
  assert.equal(ins.length, 1);
  await cancelInstance(g, ins[0].id);
  const after = await listInstances(g, { from: '2026-07-01', to: '2026-07-07' });
  const cancelled = after.filter((i) => i.status === 'cancelled');
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].id, ins[0].id);
});

test('inactive recurring assignments are not seeded', async () => {
  const g = createMemoryGateway({
    ShiftTemplates: [
      ['id', 'location', 'label', 'days', 'start', 'end', 'headcount', 'valid_from', 'valid_to', 'active'],
      ['tpl_2', 'Site B', 'Morning', 'Wed', '08:00', '16:00', '1', '', '', 'yes'],
    ],
    RecurringAssignments: [
      ['template_id', 'employee_phone', 'active', 'created_at'],
      ['tpl_2', '15559990000', 'no', ''], // inactive
    ],
    ShiftInstances: [['id', 'template_id', 'location', 'date', 'start', 'end', 'headcount', 'status', 'generated_at']],
    ShiftAssignments: [['instance_id', 'employee_phone', 'source', 'status', 'assigned_at', 'assigned_by']],
  });
  const r = await generateInstances(g, '2026-07-01', 7);
  assert.equal(r.instancesCreated, 1);
  assert.equal(r.assignmentsSeeded, 0);
  const a = await listAssignments(g, { instanceId: 'tpl_2_20260701' });
  assert.equal(a.length, 0);
});

test('inactive templates are skipped', async () => {
  const g = createMemoryGateway({
    ShiftTemplates: [
      ['id', 'location', 'label', 'days', 'start', 'end', 'headcount', 'valid_from', 'valid_to', 'active'],
      ['tpl_3', 'Site C', 'Eve', 'Wed', '18:00', '22:00', '1', '', '', 'no'],
    ],
    RecurringAssignments: [['template_id', 'employee_phone', 'active', 'created_at']],
    ShiftInstances: [['id', 'template_id', 'location', 'date', 'start', 'end', 'headcount', 'status', 'generated_at']],
    ShiftAssignments: [['instance_id', 'employee_phone', 'source', 'status', 'assigned_at', 'assigned_by']],
  });
  const r = await generateInstances(g, '2026-07-01', 7);
  assert.equal(r.instancesCreated, 0);
  assert.equal(r.templatesProcessed, 0);
});
