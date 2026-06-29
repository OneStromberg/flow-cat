import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayISO, yesterdayISO, resolveTypedDate, localWallClockToUTC } from './dates.ts';

const now = new Date('2026-06-20T09:00:00Z'); // fixed clock
const tz = 'Asia/Jerusalem';

test('today/yesterday in tz', () => {
  assert.equal(todayISO(tz, now), '2026-06-20');
  assert.equal(yesterdayISO(tz, now), '2026-06-19');
});

test('resolveTypedDate parses DD/MM/YYYY', () => {
  assert.deepEqual(resolveTypedDate('19/06/2026', tz, now), { ok: true, iso: '2026-06-19' });
});

test('rejects malformed dates', () => {
  assert.deepEqual(resolveTypedDate('2026-06-19', tz, now), { ok: false, reason: 'invalid' });
  assert.deepEqual(resolveTypedDate('45/13/2026', tz, now), { ok: false, reason: 'invalid' });
});

test('rejects future dates', () => {
  assert.deepEqual(resolveTypedDate('25/06/2026', tz, now), { ok: false, reason: 'future' });
});

test('localWallClockToUTC converts Jerusalem wall-clock to UTC instant', () => {
  assert.equal(localWallClockToUTC('2026-07-01', '08:00', 'Asia/Jerusalem'), '2026-07-01T05:00:00.000Z');
  assert.equal(localWallClockToUTC('2026-01-01', '08:00', 'Asia/Jerusalem'), '2026-01-01T06:00:00.000Z');
  assert.equal(localWallClockToUTC('2026-07-01', '08:00', 'UTC'), '2026-07-01T08:00:00.000Z');
  assert.equal(localWallClockToUTC('bad', '08:00', 'UTC'), '');
});
