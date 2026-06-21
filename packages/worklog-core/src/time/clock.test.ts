import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClockTime, computeHours } from './clock.ts';

test('parses valid 24h times', () => {
  assert.deepEqual(parseClockTime('08:00'), { h: 8, m: 0 });
  assert.deepEqual(parseClockTime('9:30'), { h: 9, m: 30 });
  assert.deepEqual(parseClockTime('23:59'), { h: 23, m: 59 });
});

test('rejects bad times', () => {
  assert.equal(parseClockTime('24:00'), null);
  assert.equal(parseClockTime('8'), null);
  assert.equal(parseClockTime('8:60'), null);
  assert.equal(parseClockTime('abc'), null);
});

test('computes hours and rejects non-positive spans', () => {
  assert.equal(computeHours({ h: 8, m: 0 }, { h: 16, m: 30 }), 8.5);
  assert.equal(computeHours({ h: 9, m: 0 }, { h: 9, m: 0 }), null);
  assert.equal(computeHours({ h: 17, m: 0 }, { h: 9, m: 0 }), null);
});
