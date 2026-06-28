import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shiftStatusColor } from './shift-colors.js';

const base = { date: '2026-06-28', start: '09:00', end: '17:00', headcount: 2, assigned: 0 };

describe('shiftStatusColor', () => {
  it('cancelled → gray', () => {
    assert.equal(shiftStatusColor({ ...base, status: 'cancelled', nowISO: '2026-06-28T10:00' }), 'gray');
  });

  it('fully assigned → green', () => {
    assert.equal(shiftStatusColor({ ...base, status: 'active', assigned: 2, nowISO: '2026-06-28T10:00' }), 'green');
  });

  it('understaffed upcoming → yellow', () => {
    // now is before start
    assert.equal(shiftStatusColor({ ...base, status: 'active', assigned: 1, nowISO: '2026-06-28T08:00' }), 'yellow');
  });

  it('understaffed ongoing → red', () => {
    // now is during the shift
    assert.equal(shiftStatusColor({ ...base, status: 'active', assigned: 1, nowISO: '2026-06-28T12:00' }), 'red');
  });

  it('understaffed past → red', () => {
    // now is after end
    assert.equal(shiftStatusColor({ ...base, status: 'active', assigned: 1, nowISO: '2026-06-28T18:00' }), 'red');
  });

  it('overnight shift: end < start wraps to next day', () => {
    const overnight = { ...base, start: '22:00', end: '06:00', status: 'active', assigned: 0 };
    // now at 23:00 on same day → ongoing → red
    assert.equal(shiftStatusColor({ ...overnight, nowISO: '2026-06-28T23:00' }), 'red');
    // now at 05:00 next day → ongoing → red
    assert.equal(shiftStatusColor({ ...overnight, nowISO: '2026-06-29T05:00' }), 'red');
    // now at 07:00 next day → past → red
    assert.equal(shiftStatusColor({ ...overnight, nowISO: '2026-06-29T07:00' }), 'red');
    // now at 21:00 same day → upcoming → yellow
    assert.equal(shiftStatusColor({ ...overnight, nowISO: '2026-06-28T21:00' }), 'yellow');
  });
});
