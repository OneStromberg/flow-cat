import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { findMissedCheckins } from './missed-checkins.ts';

function seed(extra: Record<string, string[][]> = {}) {
  return createMemoryGateway({
    ShiftInstances: [['id','template_id','location','date','start','end','headcount','status','generated_at'],
      ['i1','t1','Site A','2026-07-01','08:00','16:00','1','scheduled','']],
    ShiftAssignments: [['instance_id','employee_phone','source','status','assigned_at','assigned_by'],
      ['i1','972501234567','manual','assigned','','']],
    Attendance: [['id','instance_id','employee_phone','date','check_in_at','check_in_lat','check_in_lng','check_in_photo','check_in_in_geofence','check_out_at','check_out_lat','check_out_lng','check_out_photo','check_out_in_geofence','hours','status']],
    Alerts: [['instance_id','employee_phone','type','sent_at']],
    ...extra,
  });
}

test('missed check-IN: start+grace passed, no attendance', async () => {
  const g = seed();
  const m = await findMissedCheckins(g, '2026-07-01T08:15:00.000Z', 10); // 15min after 08:00
  assert.equal(m.length, 1); assert.equal(m[0].type, 'in'); assert.equal(m[0].employeePhone, '972501234567'); assert.equal(m[0].location, 'Site A');
});

test('not missed before grace', async () => {
  const g = seed();
  assert.equal((await findMissedCheckins(g, '2026-07-01T08:05:00.000Z', 10)).length, 0);
});

test('checked in → no missed check-in; missed check-OUT after end+grace while still open', async () => {
  const g = seed({ Attendance: [
    ['id','instance_id','employee_phone','date','check_in_at','check_in_lat','check_in_lng','check_in_photo','check_in_in_geofence','check_out_at','check_out_lat','check_out_lng','check_out_photo','check_out_in_geofence','hours','status'],
    ['a1','i1','972501234567','2026-07-01','2026-07-01T08:00:00.000Z','','','','no','','','','','no','','open'],
  ]});
  const inM = await findMissedCheckins(g, '2026-07-01T08:15:00.000Z', 10);
  assert.equal(inM.length, 0); // checked in
  const outM = await findMissedCheckins(g, '2026-07-01T16:20:00.000Z', 10); // 20min after 16:00 end, still open
  assert.equal(outM.length, 1); assert.equal(outM[0].type, 'out');
});
