import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway, rowsToObjects } from '@scourage/sheets-helper';
import { distanceMeters, withinGeofence, hoursBetween, checkIn, checkOut, listAttendance, adminCorrect } from './attendance.ts';

test('distanceMeters ~ haversine (Tel Aviv ~ 1 deg lat ≈ 111km)', () => {
  const d = distanceMeters(32.0, 34.0, 33.0, 34.0);
  assert.ok(Math.abs(d - 111195) < 500); // ~111 km
  assert.ok(distanceMeters(32.08, 34.78, 32.08, 34.78) < 1); // same point ~ 0
});
test('withinGeofence', () => {
  assert.equal(withinGeofence(80, 100), true);
  assert.equal(withinGeofence(120, 100), false);
});
test('hoursBetween (absolute timestamps, overnight needs no special case)', () => {
  assert.equal(hoursBetween('2026-07-01T22:00:00.000Z', '2026-07-02T06:00:00.000Z'), 8);
  assert.equal(hoursBetween('2026-07-01T08:00:00.000Z', '2026-07-01T16:30:00.000Z'), 8.5);
  assert.equal(hoursBetween('bad', '2026-07-01T16:00:00.000Z'), 0);
});
function gw() {
  return createMemoryGateway({
    ShiftInstances: [['id','template_id','location','date','start','end','headcount','status','generated_at'],
      ['tpl_1_20260701','tpl_1','Site A','2026-07-01','22:00','06:00','2','scheduled','']],
    Attendance: [['id','instance_id','employee_phone','date','check_in_at','check_in_lat','check_in_lng','check_in_photo','check_in_in_geofence','check_out_at','check_out_lat','check_out_lng','check_out_photo','check_out_in_geofence','hours','status']],
  });
}
test('checkIn then checkOut computes hours and closes; double check-in rejected', async () => {
  const g = gw();
  const ci = await checkIn(g, { instanceId:'tpl_1_20260701', employeePhone:'15551230000', at:'2026-07-01T22:00:00.000Z', lat:'32.08', lng:'34.78', photo:'', inGeofence:true });
  assert.equal(ci.ok, true);
  const dup = await checkIn(g, { instanceId:'tpl_1_20260701', employeePhone:'15551230000', at:'2026-07-01T22:05:00.000Z', lat:'32.08', lng:'34.78', photo:'', inGeofence:true });
  assert.equal(dup.ok, false);
  const co = await checkOut(g, { instanceId:'tpl_1_20260701', employeePhone:'15551230000', at:'2026-07-02T06:00:00.000Z', lat:'32.08', lng:'34.78', photo:'', inGeofence:true });
  assert.equal(co.ok, true); if (co.ok) assert.equal(co.hours, '8');
  const list = await listAttendance(g, { employeePhone:'15551230000' });
  assert.equal(list.length, 1); assert.equal(list[0].status, 'closed'); assert.equal(list[0].hours, '8');
});
test('adminCorrect uses an explicit hours override on a closed row', async () => {
  const g = createMemoryGateway({ Attendance: [
    ['id','instance_id','employee_phone','date','check_in_at','check_in_lat','check_in_lng','check_in_photo','check_in_in_geofence','check_out_at','check_out_lat','check_out_lng','check_out_photo','check_out_in_geofence','hours','status'],
    ['a1','i1','p1','2026-07-01','2026-07-01T08:00:00.000Z','','','','no','2026-07-01T16:00:00.000Z','','','','no','8','closed'],
  ]});
  const r = await adminCorrect(g, 'a1', { hours: '5' });
  assert.equal(r.ok, true);
  const row = rowsToObjects(g.dump()['Attendance']).find((o) => o.id === 'a1');
  assert.ok(row);
  assert.equal(row.hours, '5');
});
