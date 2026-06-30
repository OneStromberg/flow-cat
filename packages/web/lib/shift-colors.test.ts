import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftStatusColor } from './shift-colors.js';

const base = { status:'scheduled', date:'2026-07-01', start:'08:00', end:'16:00', tz:'Asia/Jerusalem', graceMins:10 };
// Jerusalem +3 (IDT): 08:00→05:00Z, 16:00→13:00Z
test('within window, nobody present → orange (no-show OR early checkout)', () => {
  assert.equal(shiftStatusColor({ ...base, nowISO:'2026-07-01T06:00:00.000Z', assigned:1, headcount:1, presentNow:0 }), 'orange');
});
test('within window, someone present → green', () => {
  assert.equal(shiftStatusColor({ ...base, nowISO:'2026-07-01T06:00:00.000Z', assigned:1, headcount:1, presentNow:1 }), 'green');
});
test('within window, understaffed on paper → red', () => {
  assert.equal(shiftStatusColor({ ...base, nowISO:'2026-07-01T06:00:00.000Z', assigned:0, headcount:1, presentNow:0 }), 'red');
});
test('not started, fully assigned → green; not started, understaffed → yellow', () => {
  assert.equal(shiftStatusColor({ ...base, nowISO:'2026-07-01T04:00:00.000Z', assigned:1, headcount:1, presentNow:0 }), 'green');
  assert.equal(shiftStatusColor({ ...base, nowISO:'2026-07-01T04:00:00.000Z', assigned:0, headcount:1, presentNow:0 }), 'yellow');
});
test('after end → green if was staffed, red if never staffed', () => {
  assert.equal(shiftStatusColor({ ...base, nowISO:'2026-07-01T14:00:00.000Z', assigned:1, headcount:1, presentNow:0 }), 'green');
  assert.equal(shiftStatusColor({ ...base, nowISO:'2026-07-01T14:00:00.000Z', assigned:0, headcount:1, presentNow:0 }), 'red');
});
test('cancelled → gray', () => {
  assert.equal(shiftStatusColor({ ...base, status:'cancelled', nowISO:'2026-07-01T06:00:00.000Z', assigned:1, headcount:1, presentNow:0 }), 'gray');
});
