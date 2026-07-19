import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { todayISO, type Worker } from '@scourage/worklog-core';
import { loadCheckinData } from './worker-checkin';

const COMPANY_TZ = process.env.COMPANY_TIMEZONE ?? 'UTC';
const TODAY = todayISO(COMPANY_TZ);
const YESTERDAY = '2000-01-01'; // any date != TODAY — instance on this date must never appear

const worker: Worker = {
  phone: '15551230000',
  name: 'Jane',
  greeting: '',
  places: ['Site A', 'Site B'],
  active: true,
  teudatZeut: '',
};

const TEMPLATES_HEADER = ['id', 'location', 'label', 'days', 'start', 'end', 'headcount', 'valid_from', 'valid_to', 'active', 'rate', 'instructions', 'day_times', 'selfie_start', 'selfie_end'];
const INSTANCES_HEADER = ['id', 'template_id', 'location', 'date', 'start', 'end', 'headcount', 'status', 'generated_at'];
const ASSIGN_HEADER = ['instance_id', 'employee_phone', 'source', 'status', 'assigned_at', 'assigned_by', 'rate'];
const PLACES_HEADER = ['place_name', 'active', 'lat', 'lng', 'place_id', 'address', 'client', 'geofence_radius_m', 'contact', 'base_rate', 'required_attributes', 'notes', 'grace_mins'];
const ATTENDANCE_HEADER = [
  'id', 'instance_id', 'employee_phone', 'date',
  'check_in_at', 'check_in_lat', 'check_in_lng', 'check_in_photo', 'check_in_in_geofence',
  'check_out_at', 'check_out_lat', 'check_out_lng', 'check_out_photo', 'check_out_in_geofence',
  'hours', 'status',
];

function attendanceRow(o: {
  id: string; instanceId: string; phone: string; date: string;
  checkInAt: string; checkOutAt: string; hours: string; status: string;
}): string[] {
  return [
    o.id, o.instanceId, o.phone, o.date,
    o.checkInAt, '', '', '', 'no',
    o.checkOutAt, '', '', '', 'no',
    o.hours, o.status,
  ];
}

test('loadCheckinData: today-only assigned instances, attendance join, selfie flags, place info, open-first sort', async () => {
  const gw = createMemoryGateway({
    ShiftTemplates: [
      TEMPLATES_HEADER,
      // selfie required at start only
      ['tpl_1', 'Site A', 'Guard', 'Mon,Tue,Wed,Thu,Fri', '08:00', '16:00', '2', '', '', 'yes', '', 'Wear vest', '', 'yes', ''],
      // selfie required at end only, includes instructions
      ['tpl_2', 'Site B', 'Cleaner', 'Mon,Tue,Wed,Thu,Fri', '09:00', '17:00', '1', '', '', 'yes', '', 'Bring badge', '', '', 'yes'],
    ],
    ShiftInstances: [
      INSTANCES_HEADER,
      ['i1', 'tpl_1', 'Site A', TODAY, '08:00', '16:00', '2', 'scheduled', ''],
      ['i2', 'tpl_2', 'Site B', TODAY, '09:00', '17:00', '1', 'scheduled', ''],
      // assigned to worker but NOT today — must be excluded entirely
      ['i3', 'tpl_1', 'Site A', YESTERDAY, '08:00', '16:00', '2', 'scheduled', ''],
      // today, but NOT assigned to this worker — must be excluded
      ['i4', 'tpl_2', 'Site B', TODAY, '09:00', '17:00', '1', 'scheduled', ''],
    ],
    ShiftAssignments: [
      ASSIGN_HEADER,
      ['i1', worker.phone, 'manual', 'assigned', '', '', ''],
      ['i2', worker.phone, 'manual', 'assigned', '', '', ''],
      ['i3', worker.phone, 'manual', 'assigned', '', '', ''],
      // another worker's assignment to i4 — confirms i4 is excluded because of assignment, not date
      ['i4', '15559998888', 'manual', 'assigned', '', '', ''],
    ],
    Places: [
      PLACES_HEADER,
      ['Site A', 'yes', '32.0', '34.7', 'place_abc', '123 Main St', 'ClientCo', '100', '050-1111111', '', '', '', ''],
      ['Site B', 'yes', '31.5', '35.1', '', '456 Oak Ave', 'OtherCo', '100', '050-2222222', '', '', '', ''],
    ],
    Attendance: [
      ATTENDANCE_HEADER,
      // worker is currently OPEN on i1 (checked in, not out)
      attendanceRow({ id: 'a1', instanceId: 'i1', phone: worker.phone, date: TODAY, checkInAt: `${TODAY}T08:05:00.000Z`, checkOutAt: '', hours: '', status: 'open' }),
      // another worker's attendance on i2 — must not leak into this worker's item
      attendanceRow({ id: 'a2', instanceId: 'i2', phone: '15559998888', date: TODAY, checkInAt: `${TODAY}T09:00:00.000Z`, checkOutAt: `${TODAY}T17:00:00.000Z`, hours: '8', status: 'closed' }),
    ],
  });

  const data = await loadCheckinData(gw, worker);

  assert.equal(data.workerName, 'Jane');
  assert.equal(data.today, TODAY);
  assert.equal(data.items.length, 2);

  // Open shift (i1) sorts first regardless of start-time proximity.
  assert.equal(data.items[0].instance.id, 'i1');
  assert.equal(data.items[1].instance.id, 'i2');

  const i1 = data.items[0];
  assert.equal(i1.attendance?.status, 'open');
  assert.equal(i1.attendance?.id, 'a1');
  assert.equal(i1.role, 'Guard');
  assert.equal(i1.instructions, 'Wear vest');
  assert.equal(i1.address, '123 Main St');
  assert.equal(i1.contact, '050-1111111');
  assert.match(i1.wazeUrl, /^https:\/\/waze\.com\/ul\?ll=32\.0,34\.7/);
  assert.match(i1.mapsUrl, /place_abc/);
  assert.equal(i1.selfieStart, true);
  assert.equal(i1.selfieEnd, false);

  const i2 = data.items[1];
  // i2 has no attendance for THIS worker (a2 belongs to another worker) — must be null, not leaked.
  assert.equal(i2.attendance, null);
  assert.equal(i2.role, 'Cleaner');
  assert.equal(i2.instructions, 'Bring badge');
  assert.equal(i2.address, '456 Oak Ave');
  assert.equal(i2.selfieStart, false);
  assert.equal(i2.selfieEnd, true);
  // Place has no place_id — mapsUrl must omit the query_place_id param.
  assert.doesNotMatch(i2.mapsUrl, /query_place_id/);
});

test('loadCheckinData: no assigned instances today -> empty items; workerName falls back to phone', async () => {
  const gw = createMemoryGateway({
    ShiftTemplates: [TEMPLATES_HEADER],
    ShiftInstances: [INSTANCES_HEADER],
    ShiftAssignments: [ASSIGN_HEADER],
    Places: [PLACES_HEADER],
    Attendance: [ATTENDANCE_HEADER],
  });

  // `name` typed as required `string`, but real Sheets rows can still come back
  // missing it at runtime — cast to exercise the `worker.name ?? worker.phone` fallback.
  const noNameWorker = { ...worker, name: undefined } as unknown as Worker;
  const data = await loadCheckinData(gw, noNameWorker);

  assert.deepEqual(data.items, []);
  assert.equal(data.workerName, worker.phone);
});

test('loadCheckinData: closed attendance preferred when no open record exists for the instance', async () => {
  const gw = createMemoryGateway({
    ShiftTemplates: [
      TEMPLATES_HEADER,
      ['tpl_1', 'Site A', 'Guard', 'Mon,Tue,Wed,Thu,Fri', '08:00', '16:00', '2', '', '', 'yes', '', '', '', '', ''],
    ],
    ShiftInstances: [
      INSTANCES_HEADER,
      ['i1', 'tpl_1', 'Site A', TODAY, '08:00', '16:00', '2', 'scheduled', ''],
    ],
    ShiftAssignments: [
      ASSIGN_HEADER,
      ['i1', worker.phone, 'manual', 'assigned', '', '', ''],
    ],
    Places: [PLACES_HEADER],
    Attendance: [
      ATTENDANCE_HEADER,
      attendanceRow({ id: 'a1', instanceId: 'i1', phone: worker.phone, date: TODAY, checkInAt: `${TODAY}T08:00:00.000Z`, checkOutAt: `${TODAY}T16:00:00.000Z`, hours: '8', status: 'closed' }),
    ],
  });

  const data = await loadCheckinData(gw, worker);

  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].attendance?.status, 'closed');
  assert.equal(data.items[0].attendance?.id, 'a1');
});
