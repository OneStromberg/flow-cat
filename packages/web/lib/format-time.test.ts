import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatHmInTz } from './format-time';

test('formatHmInTz renders Jerusalem wall-clock for summer and winter UTC offsets', () => {
  assert.equal(formatHmInTz('2026-07-01T05:00:00.000Z', 'Asia/Jerusalem'), '08:00'); // IDT +3
  assert.equal(formatHmInTz('2026-01-01T06:00:00.000Z', 'Asia/Jerusalem'), '08:00'); // IST +2
});
test('formatHmInTz returns input on unparseable value', () => {
  assert.equal(formatHmInTz('not-a-date', 'Asia/Jerusalem'), 'not-a-date');
  assert.equal(formatHmInTz('', 'Asia/Jerusalem'), '');
});
