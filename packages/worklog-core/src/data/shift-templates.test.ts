import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { listTemplates, addTemplate } from './shift-templates.ts';

const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

test('addTemplate validates and stores a template', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active']] });
  const r = await addTemplate(g, { location: 'Site A', label: 'Night', days: ['Mon','Wed','Fri'], start: '22:00', end: '06:00', headcount: '2', validFrom: '2026-07-01', validTo: '' });
  assert.equal(r.ok, true);
  const ts = await listTemplates(g);
  assert.equal(ts.length, 1);
  assert.deepEqual(ts[0].days, ['Mon','Wed','Fri']);
  assert.equal(ts[0].headcount, 2);
  assert.equal(ts[0].active, true);
  assert.equal(ts[0].end, '06:00');
});

test('addTemplate rejects bad weekday, time, headcount, and identical start/end', async () => {
  const g = createMemoryGateway({ ShiftTemplates: [['id','location','label','days','start','end','headcount','valid_from','valid_to','active']] });
  const noDay = await addTemplate(g, { location:'A', label:'D', days:[], start:'08:00', end:'16:00', headcount:'1', validFrom:'', validTo:'' });
  assert.equal(noDay.ok, false); if (!noDay.ok) assert.ok(noDay.errors.days);
  const badTime = await addTemplate(g, { location:'A', label:'D', days:['Mon'], start:'25:00', end:'16:00', headcount:'1', validFrom:'', validTo:'' });
  assert.equal(badTime.ok, false); if (!badTime.ok) assert.ok(badTime.errors.start);
  const badHc = await addTemplate(g, { location:'A', label:'D', days:['Mon'], start:'08:00', end:'16:00', headcount:'0', validFrom:'', validTo:'' });
  assert.equal(badHc.ok, false); if (!badHc.ok) assert.ok(badHc.errors.headcount);
  const same = await addTemplate(g, { location:'A', label:'D', days:['Mon'], start:'08:00', end:'08:00', headcount:'1', validFrom:'', validTo:'' });
  assert.equal(same.ok, false); if (!same.ok) assert.ok(same.errors.end);
});
