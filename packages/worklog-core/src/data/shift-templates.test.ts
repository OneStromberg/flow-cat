import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { listTemplates, addTemplate, copyTemplate } from './shift-templates.ts';
import { listRecurring, addRecurring } from './shift-assignments.ts';

const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

test('addTemplate validates and stores a template', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active']] });
  const r = await addTemplate(g, { location: 'Site A', label: 'Night', days: ['Mon','Wed','Fri'], start: '22:00', end: '06:00', headcount: '2', validFrom: '2026-07-01', validTo: '', rate: '' });
  assert.equal(r.ok, true);
  const ts = await listTemplates(g);
  assert.equal(ts.length, 1);
  assert.deepEqual(ts[0].days, ['Mon','Wed','Fri']);
  assert.equal(ts[0].headcount, 2);
  assert.equal(ts[0].active, true);
  assert.equal(ts[0].end, '06:00');
});

test('addTemplate stores an optional rate', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate']] });
  const r = await addTemplate(g, { location:'A', label:'Night', days:['Mon'], start:'22:00', end:'06:00', headcount:'1', validFrom:'', validTo:'', rate:'55' });
  assert.equal(r.ok, true);
  const t = (await listTemplates(g))[0];
  assert.equal(t.rate, '55');
});

test('addTemplate rejects bad weekday, time, headcount, and identical start/end', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active']] });
  const noDay = await addTemplate(g, { location:'A', label:'D', days:[], start:'08:00', end:'16:00', headcount:'1', validFrom:'', validTo:'', rate:'' });
  assert.equal(noDay.ok, false); if (!noDay.ok) assert.ok(noDay.errors.days);
  const badTime = await addTemplate(g, { location:'A', label:'D', days:['Mon'], start:'25:00', end:'16:00', headcount:'1', validFrom:'', validTo:'', rate:'' });
  assert.equal(badTime.ok, false); if (!badTime.ok) assert.ok(badTime.errors.start);
  const badHc = await addTemplate(g, { location:'A', label:'D', days:['Mon'], start:'08:00', end:'16:00', headcount:'0', validFrom:'', validTo:'', rate:'' });
  assert.equal(badHc.ok, false); if (!badHc.ok) assert.ok(badHc.errors.headcount);
  const same = await addTemplate(g, { location:'A', label:'D', days:['Mon'], start:'08:00', end:'08:00', headcount:'1', validFrom:'', validTo:'', rate:'' });
  assert.equal(same.ok, false); if (!same.ok) assert.ok(same.errors.end);
});

test('copyTemplate duplicates fields with new validity and carries assignments', async () => {
  const g = createMemoryGateway({
    ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate']],
    RecurringAssignments: [['template_id','employee_phone','active','created_at']],
  });
  const src = await addTemplate(g, { location:'Site A', label:'Day', days:['Mon','Wed'], start:'08:00', end:'16:00', headcount:'2', validFrom:'2026-01-01', validTo:'2026-06-30', rate:'40' });
  const srcId = src.ok ? src.id : '';
  await addRecurring(g, srcId, '15551230000');
  const cp = await copyTemplate(g, srcId, { validFrom:'2026-07-01', validTo:'2026-12-31', carryAssignments:true });
  assert.equal(cp.ok, true);
  const newId = cp.ok ? cp.id : '';
  const t = (await listTemplates(g)).find((x)=>x.id===newId)!;
  assert.deepEqual(t.days, ['Mon','Wed']); assert.equal(t.start,'08:00'); assert.equal(t.validFrom,'2026-07-01'); assert.equal(t.rate,'40');
  const rec = (await listRecurring(g, newId)).filter((r)=>r.active);
  assert.equal(rec.length, 1); assert.equal(rec[0].employeePhone, '15551230000');
});
