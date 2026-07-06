import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { findMissedCheckins, lastAlertAtByKey, shouldRealert } from './missed-checkins.ts';

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

test('start time is interpreted in the given tz (Jerusalem)', async () => {
  const g = seed({ Places: [
    ['place_name','active','lat','lng','place_id','address','client','geofence_radius_m','contact','base_rate','required_attributes','notes','grace_mins'],
    ['Site A','yes','','','','','','100','','','','',''],
  ]});
  // 08:20 Jerusalem (IDT, UTC+3) = 05:20 UTC; >10min after 05:00 UTC start
  const m = await findMissedCheckins(g, '2026-07-01T05:20:00.000Z', 10, 'Asia/Jerusalem');
  assert.equal(m.length, 1); assert.equal(m[0].type, 'in');
  // 08:05 Jerusalem = 05:05 UTC; within grace → not missed
  assert.equal((await findMissedCheckins(g, '2026-07-01T05:05:00.000Z', 10, 'Asia/Jerusalem')).length, 0);
});

test('lastAlertAtByKey returns latest sent_at; shouldRealert respects the window', async () => {
  const g = createMemoryGateway({ Alerts: [
    ['instance_id','employee_phone','type','sent_at'],
    ['i1','p1','in','2026-07-06T08:00:00.000Z'],
    ['i1','p1','in','2026-07-06T08:05:00.000Z'],
  ]});
  const m = await lastAlertAtByKey(g);
  assert.equal(m.get('i1|p1|in'), '2026-07-06T08:05:00.000Z');
  assert.equal(shouldRealert(m.get('i1|p1|in'), '2026-07-06T08:09:00.000Z', 5*60000), false);
  assert.equal(shouldRealert(m.get('i1|p1|in'), '2026-07-06T08:11:00.000Z', 5*60000), true);
  assert.equal(shouldRealert(undefined, '2026-07-06T08:11:00.000Z', 5*60000), true);
});
