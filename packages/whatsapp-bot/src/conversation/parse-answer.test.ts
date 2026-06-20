import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer } from './parse-answer.ts';
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';

const tz = 'Asia/Jerusalem';
const now = new Date('2026-06-20T09:00:00Z');
const worker: Worker = { phone: '555', name: 'John', greeting: '', places: ['Warehouse', 'Office HQ'], active: true };
const q = (o: Partial<Question>): Question => ({ order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...o });

test('worker_places accepts list id and typed number/label', () => {
  const wp = q({ type: 'worker_places' });
  assert.deepEqual(parseAnswer(wp, { phone: '555', selectionId: 'opt_1' }, tz, worker, now), { ok: true, value: 'Office HQ' });
  assert.deepEqual(parseAnswer(wp, { phone: '555', text: '1' }, tz, worker, now), { ok: true, value: 'Warehouse' });
  assert.deepEqual(parseAnswer(wp, { phone: '555', text: 'office hq' }, tz, worker, now), { ok: true, value: 'Office HQ' });
  assert.equal(parseAnswer(wp, { phone: '555', text: 'nope' }, tz, worker, now).ok, false);
});

test('date today/yesterday and typed', () => {
  const d = q({ type: 'date' });
  assert.deepEqual(parseAnswer(d, { phone: '555', selectionId: 'date_today' }, tz, worker, now), { ok: true, value: '2026-06-20' });
  assert.deepEqual(parseAnswer(d, { phone: '555', selectionId: 'date_yesterday' }, tz, worker, now), { ok: true, value: '2026-06-19' });
  assert.deepEqual(parseAnswer(d, { phone: '555', text: '18/06/2026' }, tz, worker, now), { ok: true, value: '2026-06-18' });
  assert.equal(parseAnswer(d, { phone: '555', selectionId: 'date_other' }, tz, worker, now).ok, false);
});

test('time parses or reprompts', () => {
  const t = q({ type: 'time' });
  assert.deepEqual(parseAnswer(t, { phone: '555', text: '8:00' }, tz, worker, now), { ok: true, value: '08:00' });
  assert.equal(parseAnswer(t, { phone: '555', text: 'noon' }, tz, worker, now).ok, false);
});

test('number parses or reprompts', () => {
  const n = q({ type: 'number' });
  assert.deepEqual(parseAnswer(n, { phone: '555', text: '3' }, tz, worker, now), { ok: true, value: '3' });
  assert.equal(parseAnswer(n, { phone: '555', text: 'three' }, tz, worker, now).ok, false);
});
