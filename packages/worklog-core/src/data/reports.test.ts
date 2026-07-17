import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { hoursByEmployee, hoursByLocation, attendanceExceptions, writeReportTab, filterAttendanceForReport, reportByObject, reportByPerson, reportSummary } from './reports.ts';
import type { ShiftInstance } from './shift-instances.ts';

const att = (over={}) => ({ id:'a', instanceId:'i1', employeePhone:'p1', date:'2026-07-01', checkInAt:'2026-07-01T08:10:00.000Z', checkInLat:'', checkInLng:'', checkInPhoto:'', checkInInGeofence:true, checkOutAt:'2026-07-01T16:00:00.000Z', checkOutLat:'', checkOutLng:'', checkOutPhoto:'', checkOutInGeofence:true, hours:'8', status:'closed', ...over });

test('hoursByEmployee sums closed hours in range', () => {
  const rows = [att({}), att({employeePhone:'p1', hours:'4', date:'2026-07-02'}), att({employeePhone:'p2', hours:'5'}), att({status:'open', hours:'9'})];
  const r = hoursByEmployee(rows as any, { from:'2026-07-01', to:'2026-07-31' });
  assert.deepEqual(r.find(x=>x.employeePhone==='p1'), { employeePhone:'p1', hours:12 });
  assert.deepEqual(r.find(x=>x.employeePhone==='p2'), { employeePhone:'p2', hours:5 });
});
test('hoursByLocation maps instance→location', () => {
  const loc = new Map([['i1','Site A']]);
  const r = hoursByLocation([att({}) ] as any, loc, { from:'2026-07-01', to:'2026-07-31' });
  assert.deepEqual(r, [{ location:'Site A', hours:8 }]);
});
test('attendanceExceptions flags out-of-zone and late', () => {
  const inst = new Map([['i1', { id:'i1', templateId:'t', location:'Site A', date:'2026-07-01', start:'08:00', end:'16:00', headcount:1, status:'scheduled' }]]);
  const late = att({ checkInAt:'2026-07-01T08:20:00.000Z' });            // 20m after 08:00 (grace 15) → late
  const ooz  = att({ checkInInGeofence:false, checkInAt:'2026-07-01T08:00:00.000Z' });
  const ex = attendanceExceptions([late, ooz] as any, inst as any, { from:'2026-07-01', to:'2026-07-31' });
  assert.ok(ex.some(e=>e.kind==='late'));
  assert.ok(ex.some(e=>e.kind==='out_of_zone'));
});
test('filterAttendanceForReport scopes by location and employee', () => {
  const att = [
    { id:'a', instanceId:'i1', employeePhone:'p1' },
    { id:'b', instanceId:'i2', employeePhone:'p2' },
  ] as any;
  const loc = new Map([['i1','Site A'],['i2','Site B']]);
  assert.equal(filterAttendanceForReport(att, loc, { location:'Site A' }).length, 1);
  assert.equal(filterAttendanceForReport(att, loc, { employeePhone:'p2' }).length, 1);
  assert.equal(filterAttendanceForReport(att, loc, {}).length, 2);
});
test('writeReportTab writes header + rows to a new tab', async () => {
  const g = createMemoryGateway({});
  await writeReportTab(g, 'Report X', ['a','b'], [['1','2'],['3','4']]);
  const rows = g.dump()['Report X'];
  assert.deepEqual(rows[0], ['a','b']); assert.equal(rows.length, 3);
});

const inst = (over = {}): ShiftInstance => ({ id:'i1', templateId:'t', location:'Place1', date:'2026-07-01', start:'08:00', end:'16:00', headcount:1, status:'scheduled', ...over });

test('filterAttendanceForReport accepts arrays and treats empty as all', () => {
  const loc = new Map([['i1','Place1'],['i2','Place2']]);
  const rows = [att({ instanceId:'i1' }), att({ instanceId:'i2', employeePhone:'p2' })];
  assert.equal(filterAttendanceForReport(rows as any, loc, { location: ['Place1'] }).length, 1);
  assert.equal(filterAttendanceForReport(rows as any, loc, { location: [] }).length, 2);
  assert.equal(filterAttendanceForReport(rows as any, loc, { employeePhone: ['p2'] }).length, 1);
});
test('reportByObject: one sheet per place, date blanked on repeat, per-worker + grand totals', () => {
  const instById = new Map([
    ['i1', inst({ id:'i1', date:'2026-07-01' })],
    ['i2', inst({ id:'i2', date:'2026-07-01', start:'16:00', end:'22:00' })],
  ]);
  const names = new Map([['p1','Victor'],['p2','Igor']]);
  const rng = { from:'2026-07-01', to:'2026-07-31' };
  const [sheet] = reportByObject(
    [att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-01', hours:'8' }),
     att({ instanceId:'i2', employeePhone:'p2', date:'2026-07-01', hours:'6' })] as any,
    instById, names, rng);
  assert.equal(sheet.name, 'Place1');
  assert.deepEqual(sheet.header, ['Date','Name','Start time','End time','Total']);
  assert.deepEqual(sheet.rows[0], ['2026-07-01','Victor','08:00','16:00','8']);
  assert.deepEqual(sheet.rows[1], ['','Igor','16:00','22:00','6']); // same date → blanked
  // totals block (per-worker then grand total) appears after the body
  assert.ok(sheet.rows.some((r) => r[0] === 'Victor' && r[1] === '8'));
  assert.ok(sheet.rows.some((r) => r[0] === 'Igor' && r[1] === '6'));
  assert.ok(sheet.rows.some((r) => r[0] === 'Total' && r[1] === '14'));
});
test('reportByPerson: one sheet per worker with per-place + grand totals', () => {
  const instById = new Map([['i1', inst({ location:'Place1' })]]);
  const names = new Map([['p1','Victor']]);
  const [sheet] = reportByPerson([att({ hours:'8' })] as any, instById, names, { from:'2026-07-01', to:'2026-07-31' });
  assert.equal(sheet.name, 'Victor');
  assert.deepEqual(sheet.header, ['Date','Place','Start time','End time','Total']);
  assert.deepEqual(sheet.rows[0], ['2026-07-01','Place1','08:00','16:00','8']);
  assert.ok(sheet.rows.some((r) => r[0] === 'Place1' && r[1] === '8')); // per-place total
  assert.ok(sheet.rows.some((r) => r[0] === 'Total' && r[1] === '8'));  // grand total
});
test('reportSummary: monthly buckets per place, hours*rate, rollup + grand total', () => {
  const instById = new Map([['i1', inst({ location:'Place1' })]]);
  const rateByLoc = new Map([['Place1','40']]);
  const sheet = reportSummary([att({ date:'2026-07-01', hours:'8' })] as any, instById, rateByLoc, { from:'2026-07-01', to:'2026-07-31' });
  assert.equal(sheet.title, 'Client / Selected places');
  assert.deepEqual(sheet.header, ['Date','Place','Hours','Rate','Total amount']);
  assert.deepEqual(sheet.rows[0], ['2026-07','Place1','8','40','320']); // month label, amount = 8*40
  assert.ok(sheet.rows.some((r) => r[0] === 'Place1' && r[4] === '320'));   // per-place rollup
  assert.ok(sheet.rows.some((r) => r[0] === 'Total' && r[4] === '320'));    // grand total
});
