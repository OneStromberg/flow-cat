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

// ── AL4: boundary + error-path cases ──────────────────────────────────────
test('formatHmInTz crosses the Israel DST spring-forward boundary correctly (2026-03-27 skips 02:00-03:00 local)', () => {
  // Last moment of IST (+2) before the 2026 spring-forward.
  assert.equal(formatHmInTz('2026-03-26T23:00:00.000Z', 'Asia/Jerusalem'), '01:00');
  // One UTC hour later, local time has jumped from 02:00 straight to 03:00 (IDT, +3).
  assert.equal(formatHmInTz('2026-03-27T00:00:00.000Z', 'Asia/Jerusalem'), '03:00');
});
