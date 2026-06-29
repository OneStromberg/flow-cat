import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftStatusColor } from './shift-colors.js';

const base = { status:'scheduled', date:'2026-07-01', start:'08:00', tz:'Asia/Jerusalem', graceMins:10 };
test('started, fully assigned, nobody checked in → orange', () => {
  assert.equal(shiftStatusColor({ ...base, nowISO:'2026-07-01T05:30:00.000Z', assigned:1, headcount:1, checkedIn:0 }), 'orange');
});
test('checked in → green', () => {
  assert.equal(shiftStatusColor({ ...base, nowISO:'2026-07-01T05:30:00.000Z', assigned:1, headcount:1, checkedIn:1 }), 'green');
});
test('understaffed + started → red; understaffed + upcoming → yellow', () => {
  assert.equal(shiftStatusColor({ ...base, nowISO:'2026-07-01T05:30:00.000Z', assigned:0, headcount:1, checkedIn:0 }), 'red');
  assert.equal(shiftStatusColor({ ...base, nowISO:'2026-07-01T04:00:00.000Z', assigned:0, headcount:1, checkedIn:0 }), 'yellow');
});
test('fully assigned + upcoming → green', () => {
  assert.equal(shiftStatusColor({ ...base, nowISO:'2026-07-01T04:00:00.000Z', assigned:1, headcount:1, checkedIn:0 }), 'green');
});
test('cancelled → gray', () => {
  assert.equal(shiftStatusColor({ ...base, status:'cancelled', nowISO:'2026-07-01T05:30:00.000Z', assigned:1, headcount:1, checkedIn:0 }), 'gray');
});
