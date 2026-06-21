import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnswers } from './validate-answers.ts';
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';

const q = (o: Partial<Question>): Question => ({ order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...o });
const worker: Worker = { phone: '5', name: 'J', greeting: '', places: ['Warehouse', 'Office HQ'], active: true, teudatZeut: '' };
const tz = 'Asia/Jerusalem';
const now = new Date('2026-06-20T09:00:00Z');
const questions = [
  q({ key: 'place', type: 'worker_places' }),
  q({ key: 'date', type: 'date' }),
  q({ key: 'start', type: 'time' }),
  q({ key: 'end', type: 'time' }),
  q({ key: 'notes', type: 'text', required: false }),
];

test('accepts a valid answer set', () => {
  const r = validateAnswers(questions, { place: 'Warehouse', date: '2026-06-19', start: '08:00', end: '16:30', notes: '' }, worker, tz, now);
  assert.deepEqual(r, { ok: true });
});

test('flags required-missing, bad place, future date, bad time, end<=start', () => {
  const r = validateAnswers(questions, { place: 'Nope', date: '2026-06-25', start: 'xx', end: '07:00' }, worker, tz, now);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.errors.place, 'Not one of your sites');
    assert.equal(r.errors.date, 'Date is in the future');
    assert.equal(r.errors.start, 'Invalid time (HH:MM)');
    // end vs start cross-check only runs when both parse; start is invalid here so end stays required-ok
  }
});

test('end must be after start when both valid', () => {
  const r = validateAnswers(questions, { place: 'Warehouse', date: '2026-06-19', start: '16:00', end: '09:00' }, worker, tz, now);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.end, 'Finish must be after start');
});
