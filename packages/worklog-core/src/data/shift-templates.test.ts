import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { listTemplates, addTemplate, copyTemplate } from './shift-templates.ts';
import { listRecurring, addRecurring } from './shift-assignments.ts';

const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

test('addTemplate validates and stores a template', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active']] });
  const r = await addTemplate(g, { location: 'Site A', label: 'Night', days: ['Mon','Wed','Fri'], start: '22:00', end: '06:00', headcount: '2', validFrom: '2026-07-01', validTo: '', rate: '', instructions: '' });
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
  const r = await addTemplate(g, { location:'A', label:'Night', days:['Mon'], start:'22:00', end:'06:00', headcount:'1', validFrom:'', validTo:'', rate:'55', instructions: '' });
  assert.equal(r.ok, true);
  const t = (await listTemplates(g))[0];
  assert.equal(t.rate, '55');
});

test('addTemplate rejects bad weekday, time, headcount, and identical start/end', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active']] });
  const noDay = await addTemplate(g, { location:'A', label:'D', days:[], start:'08:00', end:'16:00', headcount:'1', validFrom:'', validTo:'', rate:'', instructions:'' });
  assert.equal(noDay.ok, false); if (!noDay.ok) assert.ok(noDay.errors.days);
  const badTime = await addTemplate(g, { location:'A', label:'D', days:['Mon'], start:'25:00', end:'16:00', headcount:'1', validFrom:'', validTo:'', rate:'', instructions:'' });
  assert.equal(badTime.ok, false); if (!badTime.ok) assert.ok(badTime.errors.start);
  const badHc = await addTemplate(g, { location:'A', label:'D', days:['Mon'], start:'08:00', end:'16:00', headcount:'0', validFrom:'', validTo:'', rate:'', instructions:'' });
  assert.equal(badHc.ok, false); if (!badHc.ok) assert.ok(badHc.errors.headcount);
  const same = await addTemplate(g, { location:'A', label:'D', days:['Mon'], start:'08:00', end:'08:00', headcount:'1', validFrom:'', validTo:'', rate:'', instructions:'' });
  assert.equal(same.ok, false); if (!same.ok) assert.ok(same.errors.end);
});

test('addTemplate stores instructions; round-trips', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions']] });
  const r = await addTemplate(g, { location:'Site A', label:'Guard 1', days:['Sun'], start:'09:00', end:'19:00', headcount:'1', validFrom:'', validTo:'', rate:'', instructions:'Patrol the perimeter hourly. Log entries.' });
  assert.equal(r.ok, true);
  const t = (await listTemplates(g))[0];
  assert.equal(t.instructions, 'Patrol the perimeter hourly. Log entries.');
});

test('copyTemplate to another location keeps schedule + instructions, new location', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions']], RecurringAssignments: [['template_id','employee_phone','active','created_at']] });
  const src = await addTemplate(g, { location:'Site A', label:'Guard 1', days:['Sun','Mon'], start:'09:00', end:'19:00', headcount:'1', validFrom:'2026-01-01', validTo:'2026-12-31', rate:'40', instructions:'patrol' });
  const cp = await copyTemplate(g, src.ok?src.id:'', { location:'Site B', carryAssignments:false });
  assert.equal(cp.ok, true);
  const t = (await listTemplates(g)).find((x)=>x.id===(cp.ok?cp.id:''))!;
  assert.equal(t.location, 'Site B'); assert.equal(t.instructions, 'patrol'); assert.equal(t.validFrom, '2026-01-01'); assert.deepEqual(t.days, ['Sun','Mon']);
});

test('parseTemplate derives dayTimes from legacy days+start+end', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [
    ['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions'],
    ['t1','A','Day','Mon,Wed','08:00','16:00','1','','','yes','',''],
  ]});
  const t = (await listTemplates(g))[0];
  assert.deepEqual(t.dayTimes, [{day:'Mon',start:'08:00',end:'16:00'},{day:'Wed',start:'08:00',end:'16:00'}]);
});

test('addTemplate with per-day dayTimes serializes day_times and round-trips', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions','day_times']] });
  const r = await addTemplate(g, { location:'A', label:'Day', days:[], start:'', end:'', headcount:'1', validFrom:'', validTo:'', rate:'', instructions:'',
    dayTimes:[{day:'Sun',start:'09:00',end:'19:00'},{day:'Fri',start:'08:00',end:'15:00'}] });
  assert.equal(r.ok, true);
  const t = (await listTemplates(g))[0];
  assert.deepEqual(t.dayTimes, [{day:'Sun',start:'09:00',end:'19:00'},{day:'Fri',start:'08:00',end:'15:00'}]);
  assert.deepEqual(t.days, ['Sun','Fri']); // derived
});

test('addTemplate rejects an invalid per-day time', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions','day_times']] });
  const r = await addTemplate(g, { location:'A', label:'D', days:[], start:'', end:'', headcount:'1', validFrom:'', validTo:'', rate:'', instructions:'',
    dayTimes:[{day:'Sun',start:'25:00',end:'19:00'}] });
  assert.equal(r.ok, false);
});

test('addTemplate rejects dayTimes where any one entry is invalid even if others are valid', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions','day_times']] });
  // Sun entry is valid; Mon entry has invalid start — whole input must be rejected
  const r = await addTemplate(g, { location:'A', label:'D', days:[], start:'', end:'', headcount:'1', validFrom:'', validTo:'', rate:'', instructions:'',
    dayTimes:[{day:'Sun',start:'09:00',end:'19:00'},{day:'Mon',start:'25:00',end:'19:00'}] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.dayTimes);
});

test('parseTemplate sets start/end from dayTimes[0] for new-format templates', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [
    ['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate','instructions','day_times'],
    ['t1','A','Day','Wed,Fri','','','1','','','yes','','','Wed=09:00-19:00;Fri=08:00-15:00'],
  ]});
  const t = (await listTemplates(g))[0];
  assert.equal(t.start, '09:00'); // derived from first dayTime entry
  assert.equal(t.end, '19:00');
});

test('copyTemplate duplicates fields with new validity and carries assignments', async () => {
  const g = createMemoryGateway({
    ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active','rate']],
    RecurringAssignments: [['template_id','employee_phone','active','created_at']],
  });
  const src = await addTemplate(g, { location:'Site A', label:'Day', days:['Mon','Wed'], start:'08:00', end:'16:00', headcount:'2', validFrom:'2026-01-01', validTo:'2026-06-30', rate:'40', instructions:'' });
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
