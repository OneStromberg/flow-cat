import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { hoursByEmployee, hoursByLocation, attendanceExceptions, writeReportTab, filterAttendanceForReport } from './reports.ts';

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
