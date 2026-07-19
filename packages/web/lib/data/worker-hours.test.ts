import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import type { Worker } from '@scourage/worklog-core';
import { loadHoursData } from './worker-hours';

const worker: Worker = {
  phone: '15551230000',
  name: 'Jane',
  greeting: '',
  places: ['Site A', 'Site B'],
  active: true,
  teudatZeut: '',
};

const QUESTIONS_TAB = [
  ['order', 'key', 'type', 'text', 'options', 'required'],
  ['1', 'place', 'worker_places', 'Where?', '', 'yes'],
  ['2', 'hours', 'number', 'Hours', '', 'yes'],
];

const WORKLOGS_TAB = [
  ['id', 'phone', 'locked', 'hours', 'place'],
  ['e1', '15551230000', 'no', '4', 'Site A'],
  ['e2', '15551230000', 'no', '3.5', 'Site B'],
  ['e3', '15559998888', 'no', '10', 'Site A'], // another worker — must not be pulled in
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

const ATTENDANCE_HEADER = [
  'id', 'instance_id', 'employee_phone', 'date',
  'check_in_at', 'check_in_lat', 'check_in_lng', 'check_in_photo', 'check_in_in_geofence',
  'check_out_at', 'check_out_lat', 'check_out_lng', 'check_out_photo', 'check_out_in_geofence',
  'hours', 'status',
];

const INSTANCES_HEADER = ['id', 'template_id', 'location', 'date', 'start', 'end', 'headcount', 'status', 'generated_at'];

test('loadHoursData aggregates entries + resolves attended locations, sorted newest-first', async () => {
  const gw = createMemoryGateway({
    Questions: QUESTIONS_TAB,
    WorkLogs: WORKLOGS_TAB,
    Attendance: [
      ATTENDANCE_HEADER,
      attendanceRow({ id: 'a1', instanceId: 'i1', phone: '15551230000', date: '2026-06-01', checkInAt: '2026-06-01T08:00:00.000Z', checkOutAt: '2026-06-01T16:00:00.000Z', hours: '8', status: 'closed' }),
      attendanceRow({ id: 'a2', instanceId: 'i2', phone: '15551230000', date: '2026-06-05', checkInAt: '2026-06-05T08:00:00.000Z', checkOutAt: '2026-06-05T12:00:00.000Z', hours: '4', status: 'corrected' }),
      // another worker's attendance, in-range — must not leak into this worker's `attended` list
      attendanceRow({ id: 'a3', instanceId: 'i1', phone: '15559998888', date: '2026-06-03', checkInAt: '2026-06-03T08:00:00.000Z', checkOutAt: '2026-06-03T16:00:00.000Z', hours: '8', status: 'closed' }),
      // this worker's OPEN attendance — must not appear in `attended` (only closed/corrected do)
      attendanceRow({ id: 'a4', instanceId: 'i2', phone: '15551230000', date: '2026-06-06', checkInAt: '2026-06-06T08:00:00.000Z', checkOutAt: '', hours: '', status: 'open' }),
    ],
    ShiftInstances: [
      INSTANCES_HEADER,
      ['i1', 'tpl_1', 'Site A', '2026-06-01', '08:00', '16:00', '2', 'scheduled', ''],
      ['i2', 'tpl_2', 'Site B', '2026-06-05', '08:00', '16:00', '2', 'scheduled', ''],
    ],
  });

  const data = await loadHoursData(gw, worker);

  assert.equal(data.questions.length, 2);
  assert.equal(data.questionsValid, true);
  assert.equal(data.hasPlaces, true);
  assert.deepEqual(data.places, ['Site A', 'Site B']);

  // entries: only this worker's rows, totalHours summed
  assert.equal(data.entries.length, 2);
  assert.equal(data.totalHours, 7.5);

  // attended: only closed/corrected for this worker, newest first, with resolved location
  assert.equal(data.attended.length, 2);
  assert.deepEqual(data.attended.map((a) => a.id), ['a2', 'a1']);
  assert.equal(data.attended[0].location, 'Site B');
  assert.equal(data.attended[1].location, 'Site A');

  assert.match(data.today, /^\d{4}-\d{2}-\d{2}$/);
});

test('instance scoping (min..max attendance date) still resolves rows at both extremes', async () => {
  const gw = createMemoryGateway({
    Questions: QUESTIONS_TAB,
    WorkLogs: [['id', 'phone', 'locked', 'hours', 'place']],
    Attendance: [
      ATTENDANCE_HEADER,
      // Out-of-order insertion on purpose — scoping must take true min/max, not first/last row.
      attendanceRow({ id: 'a_mid', instanceId: 'i_mid', phone: '15551230000', date: '2026-03-15', checkInAt: '2026-03-15T08:00:00.000Z', checkOutAt: '2026-03-15T16:00:00.000Z', hours: '8', status: 'closed' }),
      attendanceRow({ id: 'a_early', instanceId: 'i_early', phone: '15551230000', date: '2026-01-05', checkInAt: '2026-01-05T08:00:00.000Z', checkOutAt: '2026-01-05T16:00:00.000Z', hours: '8', status: 'closed' }),
      attendanceRow({ id: 'a_late', instanceId: 'i_late', phone: '15551230000', date: '2026-06-20', checkInAt: '2026-06-20T08:00:00.000Z', checkOutAt: '2026-06-20T16:00:00.000Z', hours: '8', status: 'closed' }),
    ],
    ShiftInstances: [
      INSTANCES_HEADER,
      ['i_early', 'tpl', 'Early Site', '2026-01-05', '08:00', '16:00', '2', 'scheduled', ''],
      ['i_mid', 'tpl', 'Mid Site', '2026-03-15', '08:00', '16:00', '2', 'scheduled', ''],
      ['i_late', 'tpl', 'Late Site', '2026-06-20', '08:00', '16:00', '2', 'scheduled', ''],
      // Outside the worker's min..max range — should simply be irrelevant, not cause a miss.
      ['i_never', 'tpl', 'Unrelated Site', '2027-01-01', '08:00', '16:00', '2', 'scheduled', ''],
    ],
  });

  const data = await loadHoursData(gw, worker);

  assert.equal(data.attended.length, 3);
  const byId = new Map(data.attended.map((a) => [a.id, a]));
  assert.equal(byId.get('a_early')?.location, 'Early Site');
  assert.equal(byId.get('a_mid')?.location, 'Mid Site');
  assert.equal(byId.get('a_late')?.location, 'Late Site');
});

test('no attendance rows -> empty attended, no instance scan needed; hasPlaces false when worker has no places', async () => {
  const gw = createMemoryGateway({
    Questions: QUESTIONS_TAB,
    WorkLogs: [['id', 'phone', 'locked', 'hours', 'place']],
    Attendance: [ATTENDANCE_HEADER],
    ShiftInstances: [INSTANCES_HEADER],
  });

  const noPlacesWorker: Worker = { ...worker, places: [] };
  const data = await loadHoursData(gw, noPlacesWorker);

  assert.deepEqual(data.attended, []);
  assert.equal(data.entries.length, 0);
  assert.equal(data.totalHours, 0);
  assert.equal(data.hasPlaces, false);
});
