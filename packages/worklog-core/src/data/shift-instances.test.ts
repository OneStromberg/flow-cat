import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway, rowsToObjects } from '@scourage/sheets-helper';
import { generateInstances, listInstances, cancelInstance, updateInstance, applyTemplateEdit, seedTemplateInstances, cancelFutureInstancesForTemplate } from './shift-instances.ts';
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
    ['tpl_1_20260701_2200', 'tpl_1_20260708_2200'],
  );
  assert.equal(ins[0].end, '06:00');
  const a = await listAssignments(g, { instanceId: 'tpl_1_20260701_2200' });
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
    ['tpl_1_20260708_2200'],
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

test('updateInstance overrides one instance row', async () => {
  const g = createMemoryGateway({ ShiftInstances: [
    ['id','template_id','location','date','start','end','headcount','status','generated_at'],
    ['tpl_1_20260701','tpl_1','Site A','2026-07-01','08:00','16:00','1','scheduled',''],
  ]});
  const r = await updateInstance(g, 'tpl_1_20260701', { start:'09:00', headcount:'3' });
  assert.equal(r.ok, true);
  const i = (await listInstances(g, { from:'2026-07-01', to:'2026-07-01' }))[0];
  assert.equal(i.start, '09:00'); assert.equal(i.headcount, 3);
  const bad = await updateInstance(g, 'tpl_1_20260701', { start:'99:99' });
  assert.equal(bad.ok, false);
});

test('generateInstances uses per-day times', async () => {
  const g = createMemoryGateway({
    ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions','day_times'],
      ['t1','A','Day','Wed,Fri','09:00','19:00','1','','','yes','','','Wed=09:00-19:00;Fri=08:00-15:00']],
    RecurringAssignments: [['template_id','employee_phone','active','created_at']],
    ShiftInstances: [['id','template_id','location','date','start','end','headcount','status','generated_at']],
    ShiftAssignments: [['instance_id','employee_phone','source','status','assigned_at','assigned_by']],
  });
  await generateInstances(g, '2026-07-01', 7); // Wed 07-01, Fri 07-03
  const ins = await listInstances(g, { from:'2026-07-01', to:'2026-07-10' });
  const wed = ins.find(i=>i.date==='2026-07-01'); const fri = ins.find(i=>i.date==='2026-07-03');
  assert.equal(wed?.start, '09:00'); assert.equal(wed?.end, '19:00');
  assert.equal(fri?.start, '08:00'); assert.equal(fri?.end, '15:00');
});

test('applyTemplateEdit updates valid future instances and cancels now-invalid ones', async () => {
  const g = createMemoryGateway({
    ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate'],
      ['tpl_1','Site A','Day','Wed','10:00','18:00','2','','','yes','']], // edited: now Wed only, 10-18, hc 2
    ShiftInstances: [['id','template_id','location','date','start','end','headcount','status','generated_at'],
      ['tpl_1_20260701','tpl_1','Site A','2026-07-01','08:00','16:00','1','scheduled',''],  // Wed → update
      ['tpl_1_20260703','tpl_1','Site A','2026-07-03','08:00','16:00','1','scheduled','']], // Fri → cancel
  });
  const r = await applyTemplateEdit(g, 'tpl_1', '2026-07-01');
  assert.equal(r.updated, 1); assert.equal(r.cancelled, 1);
  const ins = await listInstances(g, { from:'2026-07-01', to:'2026-07-31' });
  const wed = ins.find((i)=>i.id==='tpl_1_20260701'); const fri = ins.find((i)=>i.id==='tpl_1_20260703');
  assert.equal(wed?.start, '10:00'); assert.equal(wed?.headcount, 2); assert.equal(wed?.status, 'scheduled');
  assert.equal(fri?.status, 'cancelled');
});

test('seedTemplateInstances seeds recurring into existing instances (idempotent)', async () => {
  // 2026-07-06 is a Monday
  const g = createMemoryGateway({
    ShiftTemplates: [
      ['id', 'location', 'label', 'days', 'start', 'end', 'headcount', 'valid_from', 'valid_to', 'active', 'rate', 'instructions', 'day_times'],
      ['t1', 'Site A', 'Day', 'Mon', '08:00', '16:00', '1', '', '', 'yes', '', '', 'Mon=08:00-16:00'],
    ],
    RecurringAssignments: [
      ['template_id', 'employee_phone', 'active', 'created_at'],
      ['t1', 'p1', 'yes', ''],
    ],
    ShiftInstances: [
      ['id', 'template_id', 'location', 'date', 'start', 'end', 'headcount', 'status', 'generated_at'],
      ['t1_20260706', 't1', 'Site A', '2026-07-06', '08:00', '16:00', '1', 'scheduled', ''],
    ],
    ShiftAssignments: [['instance_id', 'employee_phone', 'source', 'status', 'assigned_at', 'assigned_by']],
  });

  const r1 = await seedTemplateInstances(g, 't1', '2026-07-06', 42);
  assert.ok(r1.assignmentsSeeded >= 1);

  const assigns = rowsToObjects(g.dump()['ShiftAssignments']).filter(
    (o) => o.instance_id === 't1_20260706' && o.employee_phone === 'p1',
  );
  assert.equal(assigns.length, 1);

  // Idempotent: second run seeds nothing new
  const r2 = await seedTemplateInstances(g, 't1', '2026-07-06', 42);
  assert.equal(r2.assignmentsSeeded, 0);
});

test('generateInstances creates one instance per same-day slot; composite-idempotent vs old id format', async () => {
  // 2026-07-06 is a Monday
  // Template has two Mon slots: 06:00-14:00 and 14:00-22:00
  // Pre-seed the 06:00 slot with an OLD-format id (t1_20260706) to prove composite idempotency
  const g = createMemoryGateway({
    ShiftTemplates: [
      ['id', 'location', 'label', 'days', 'start', 'end', 'headcount', 'valid_from', 'valid_to', 'active', 'rate', 'instructions', 'day_times'],
      ['t1', 'Site A', 'Day', 'Mon', '06:00', '22:00', '1', '', '', 'yes', '', '', 'Mon=06:00-14:00;Mon=14:00-22:00'],
    ],
    RecurringAssignments: [['template_id', 'employee_phone', 'active', 'created_at']],
    ShiftInstances: [
      ['id', 'template_id', 'location', 'date', 'start', 'end', 'headcount', 'status', 'generated_at'],
      ['t1_20260706', 't1', 'Site A', '2026-07-06', '06:00', '14:00', '1', 'scheduled', ''],
    ],
    ShiftAssignments: [['instance_id', 'employee_phone', 'source', 'status', 'assigned_at', 'assigned_by']],
  });
  await generateInstances(g, '2026-07-06', 7);
  const inst = rowsToObjects(g.dump()['ShiftInstances']).filter(
    (o) => o.template_id === 't1' && o.date === '2026-07-06',
  );
  const starts = inst.map((o) => o.start).sort();
  assert.deepEqual(starts, ['06:00', '14:00']); // exactly two slots, no duplicate 06:00
  // old-format id is preserved for the 06:00 slot
  const slot06 = inst.find((o) => o.start === '06:00');
  assert.equal(slot06?.id, 't1_20260706');
  // new-format id for the 14:00 slot
  const slot14 = inst.find((o) => o.start === '14:00');
  assert.equal(slot14?.id, 't1_20260706_1400');
});

// ── FIX 1 regression: admin-edited start must not cause a duplicate on re-run ─
test('generateInstances: edited start does not create a duplicate on re-run', async () => {
  // 2026-07-06 is a Monday
  const g = createMemoryGateway({
    ShiftTemplates: [
      ['id', 'location', 'label', 'days', 'start', 'end', 'headcount', 'valid_from', 'valid_to', 'active', 'rate', 'instructions', 'day_times'],
      ['t1', 'Site A', 'Day', 'Mon', '08:00', '16:00', '1', '', '', 'yes', '', '', 'Mon=08:00-16:00'],
    ],
    RecurringAssignments: [['template_id', 'employee_phone', 'active', 'created_at']],
    ShiftInstances: [['id', 'template_id', 'location', 'date', 'start', 'end', 'headcount', 'status', 'generated_at']],
    ShiftAssignments: [['instance_id', 'employee_phone', 'source', 'status', 'assigned_at', 'assigned_by']],
  });

  // First run: creates t1_20260706_0800
  const r1 = await generateInstances(g, '2026-07-06', 7);
  assert.equal(r1.instancesCreated, 1);
  const allInst1 = rowsToObjects(g.dump()['ShiftInstances']).filter(
    (o) => o.template_id === 't1' && o.date === '2026-07-06',
  );
  assert.equal(allInst1.length, 1);
  assert.equal(allInst1[0].id, 't1_20260706_0800');

  // Admin edits the instance's start to 09:00 (id stays t1_20260706_0800)
  const upd = await updateInstance(g, 't1_20260706_0800', { start: '09:00' });
  assert.equal(upd.ok, true);

  // Second run: slot.start is still 08:00 → newId = t1_20260706_0800, which already exists → skip
  const r2 = await generateInstances(g, '2026-07-06', 7);
  assert.equal(r2.instancesCreated, 0, 'must not create a duplicate after start was edited');

  const allInst2 = rowsToObjects(g.dump()['ShiftInstances']).filter(
    (o) => o.template_id === 't1' && o.date === '2026-07-06',
  );
  assert.equal(allInst2.length, 1, 'must remain exactly one instance for (t1, 2026-07-06)');
});

// ── FIX 2 regression: single-slot branch must not rewrite start into a collision ─
test('applyTemplateEdit: single-slot branch leaves stale instance untouched when start would collide', async () => {
  // Template Mon now has ONE slot 06:00-14:00
  // Pre-seed TWO Mon instances for 2026-07-06: one at 06:00 (correct) and one at 14:00 (stale leftover)
  const g = createMemoryGateway({
    ShiftTemplates: [
      ['id', 'location', 'label', 'days', 'start', 'end', 'headcount', 'valid_from', 'valid_to', 'active', 'rate', 'instructions', 'day_times'],
      ['t1', 'Site A', 'Day', 'Mon', '06:00', '14:00', '1', '', '', 'yes', '', '', 'Mon=06:00-14:00'],
    ],
    ShiftInstances: [
      ['id', 'template_id', 'location', 'date', 'start', 'end', 'headcount', 'status', 'generated_at'],
      ['i1', 't1', 'Site A', '2026-07-06', '06:00', '14:00', '1', 'scheduled', ''],
      ['i2', 't1', 'Site A', '2026-07-06', '14:00', '22:00', '1', 'scheduled', ''],
    ],
  });

  await applyTemplateEdit(g, 't1', '2026-07-01');

  const inst = rowsToObjects(g.dump()['ShiftInstances']).filter((o) => o.template_id === 't1' && o.date === '2026-07-06');
  const i1 = inst.find((o) => o.id === 'i1');
  const i2 = inst.find((o) => o.id === 'i2');

  // i1 (start already 06:00) → updated normally
  assert.equal(i1?.start, '06:00');
  assert.equal(i1?.status, 'scheduled');

  // i2 (start=14:00, stale leftover) must NOT be rewritten to 06:00
  // because i1 already owns that start → left completely untouched
  assert.equal(i2?.start, '14:00', 'stale instance start must not be rewritten to 06:00');
  assert.equal(i2?.status, 'scheduled', 'stale instance must remain scheduled (not changed)');
});

test('applyTemplateEdit updates the matching slot only (multi-shift day)', async () => {
  // Template already reflects the post-edit state: 14:00 slot end is 23:00 (was 22:00)
  // Two Mon slots: 06:00-14:00 (unchanged) and 14:00-23:00 (edited end)
  // 2026-07-06 is a Monday and is future relative to the today arg '2026-07-01'
  const g = createMemoryGateway({
    ShiftTemplates: [
      ['id', 'location', 'label', 'days', 'start', 'end', 'headcount', 'valid_from', 'valid_to', 'active', 'rate', 'instructions', 'day_times'],
      ['t1', 'Site A', 'Day', 'Mon', '06:00', '23:00', '2', '', '', 'yes', '', '', 'Mon=06:00-14:00;Mon=14:00-23:00'],
    ],
    ShiftInstances: [
      ['id', 'template_id', 'location', 'date', 'start', 'end', 'headcount', 'status', 'generated_at'],
      ['t1_i1', 't1', 'Site A', '2026-07-06', '06:00', '14:00', '2', 'scheduled', ''], // matches 06:00-14:00 slot → end unchanged
      ['t1_i2', 't1', 'Site A', '2026-07-06', '14:00', '22:00', '2', 'scheduled', ''], // matches 14:00-23:00 slot → end updated
      ['t1_i3', 't1', 'Site A', '2026-07-06', '20:00', '22:00', '2', 'scheduled', ''], // no matching slot → untouched
    ],
  });

  await applyTemplateEdit(g, 't1', '2026-07-01');

  const inst = rowsToObjects(g.dump()['ShiftInstances']).filter((o) => o.template_id === 't1');
  const bySlot = Object.fromEntries(inst.map((o) => [o.start, o.end]));

  assert.equal(bySlot['06:00'], '14:00'); // matched slot, end unchanged
  assert.equal(bySlot['14:00'], '23:00'); // matched slot, end updated from 22:00 to 23:00

  // Instance with start 20:00 has no matching Mon slot → left completely untouched
  assert.equal(bySlot['20:00'], '22:00');
  const unmatched = inst.find((o) => o.start === '20:00');
  assert.equal(unmatched?.status, 'scheduled');
});

test('cancelFutureInstancesForTemplate cancels only future scheduled instances of the template', async () => {
  const g = createMemoryGateway({ ShiftInstances: [
    ['id','template_id','location','date','start','end','headcount','status','generated_at'],
    ['i_past','t1','Gedera','2026-07-01','08:00','16:00','1','scheduled',''],   // past → keep
    ['i_fut','t1','Gedera','2026-07-20','08:00','16:00','1','scheduled',''],     // future → cancel
    ['i_other','t2','Elsewhere','2026-07-20','08:00','16:00','1','scheduled',''],// other tmpl → keep
    ['i_cxl','t1','Gedera','2026-07-21','08:00','16:00','1','cancelled',''],      // already cancelled → keep
  ]});
  const r = await cancelFutureInstancesForTemplate(g, 't1', '2026-07-17');
  assert.equal(r.cancelled, 1);
  const rows = await g.readTab('ShiftInstances');
  const status = (id: string) => rows.find((x) => x[0] === id)?.[7];
  assert.equal(status('i_fut'), 'cancelled');
  assert.equal(status('i_past'), 'scheduled');
  assert.equal(status('i_other'), 'scheduled');
  // idempotent
  assert.equal((await cancelFutureInstancesForTemplate(g, 't1', '2026-07-17')).cancelled, 0);
});

test('cancelFutureInstancesForTemplate: instance dated exactly today is cancelled (date >= today, not > today)', async () => {
  const g = createMemoryGateway({ ShiftInstances: [
    ['id','template_id','location','date','start','end','headcount','status','generated_at'],
    ['i_today','t1','Gedera','2026-07-17','08:00','16:00','1','scheduled',''],
  ]});
  const r = await cancelFutureInstancesForTemplate(g, 't1', '2026-07-17');
  assert.equal(r.cancelled, 1);
  const rows = await g.readTab('ShiftInstances');
  assert.equal(rows.find((x) => x[0] === 'i_today')?.[7], 'cancelled');
});

test('cancelFutureInstancesForTemplate: an already-cancelled instance is skipped, not double-processed', async () => {
  const g = createMemoryGateway({ ShiftInstances: [
    ['id','template_id','location','date','start','end','headcount','status','generated_at'],
    ['i_cxl','t1','Gedera','2026-07-20','08:00','16:00','1','cancelled',''],
  ]});
  const r = await cancelFutureInstancesForTemplate(g, 't1', '2026-07-17');
  assert.equal(r.cancelled, 0);
  const rows = await g.readTab('ShiftInstances');
  assert.equal(rows.find((x) => x[0] === 'i_cxl')?.[7], 'cancelled'); // unchanged
});

test('cancelFutureInstancesForTemplate: unknown/nonexistent template ID cancels 0 instances', async () => {
  const g = createMemoryGateway({ ShiftInstances: [
    ['id','template_id','location','date','start','end','headcount','status','generated_at'],
    ['i_fut','t1','Gedera','2026-07-20','08:00','16:00','1','scheduled',''],
  ]});
  const r = await cancelFutureInstancesForTemplate(g, 'does_not_exist', '2026-07-17');
  assert.equal(r.cancelled, 0);
  const rows = await g.readTab('ShiftInstances');
  assert.equal(rows.find((x) => x[0] === 'i_fut')?.[7], 'scheduled'); // untouched
});
