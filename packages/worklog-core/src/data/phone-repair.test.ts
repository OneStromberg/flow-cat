import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { repairAttendancePhones } from './phone-repair.ts';

test('repairAttendancePhones normalizes stored phones in Attendance + ShiftAssignments, idempotently', async () => {
  const g = createMemoryGateway({
    Attendance: [
      ['id','instance_id','employee_phone','date','check_in_at','check_in_lat','check_in_lng','check_in_photo','check_in_in_geofence','check_out_at','check_out_lat','check_out_lng','check_out_photo','check_out_in_geofence','hours','status'],
      ['a1','i1','0506918673','2026-07-01','','','','','no','','','','','no','','closed'],
      ['a2','i1','972501112222','2026-07-01','','','','','no','','','','','no','','closed'], // already normalized
    ],
    ShiftAssignments: [
      ['instance_id','employee_phone','source','status','assigned_at','assigned_by','rate'],
      ['i1','0506918673','manual','assigned','','',''],
    ],
  });
  const r = await repairAttendancePhones(g);
  assert.equal(r.attendanceFixed, 1);
  assert.equal(r.assignmentsFixed, 1);
  const att = await g.readTab('Attendance');
  assert.equal(att[1][2], '972506918673');
  assert.equal(att[2][2], '972501112222');
  const asg = await g.readTab('ShiftAssignments');
  assert.equal(asg[1][1], '972506918673');
  const r2 = await repairAttendancePhones(g); // idempotent
  assert.equal(r2.attendanceFixed, 0);
  assert.equal(r2.assignmentsFixed, 0);
});
