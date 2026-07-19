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

// ── R1: boundary + error-path cases ───────────────────────────────────────
test('repairAttendancePhones on an empty (header-only) tab returns 0/0', async () => {
  const g = createMemoryGateway({
    Attendance: [['id', 'instance_id', 'employee_phone', 'date', 'status']],
    ShiftAssignments: [['instance_id', 'employee_phone', 'status']],
  });
  const r = await repairAttendancePhones(g);
  assert.equal(r.attendanceFixed, 0);
  assert.equal(r.assignmentsFixed, 0);
});

test('repairAttendancePhones on a completely missing tab returns 0/0 (never throws)', async () => {
  const g = createMemoryGateway({});
  const r = await repairAttendancePhones(g);
  assert.equal(r.attendanceFixed, 0);
  assert.equal(r.assignmentsFixed, 0);
});

test('repairAttendancePhones skips a blank employee_phone row without counting it', async () => {
  const g = createMemoryGateway({
    Attendance: [
      ['id', 'instance_id', 'employee_phone', 'date', 'status'],
      ['a1', 'i1', '', '2026-07-01', 'closed'],       // blank → skipped
      ['a2', 'i1', '0506918673', '2026-07-01', 'closed'], // needs fixing
    ],
    ShiftAssignments: [['instance_id', 'employee_phone', 'status']],
  });
  const r = await repairAttendancePhones(g);
  assert.equal(r.attendanceFixed, 1); // only the non-blank row counted
  const att = await g.readTab('Attendance');
  assert.equal(att[1][2], ''); // blank row left untouched
  assert.equal(att[2][2], '972506918673');
});

test('repairAttendancePhones on a tab missing the employee_phone column returns 0', async () => {
  const g = createMemoryGateway({
    Attendance: [
      ['id', 'instance_id', 'date', 'status'], // no employee_phone column at all
      ['a1', 'i1', '2026-07-01', 'closed'],
    ],
    ShiftAssignments: [['instance_id', 'employee_phone', 'status']],
  });
  const r = await repairAttendancePhones(g);
  assert.equal(r.attendanceFixed, 0);
});
