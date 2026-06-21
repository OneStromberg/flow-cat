import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorklogRecord } from './build-record.ts';
import type { Question } from '../questions/types.ts';

const q = (o: Partial<Question>): Question => ({ order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...o });
const now = new Date('2026-06-20T09:00:00Z');

test('builds record with computed hours from start+end', () => {
  const questions = [
    q({ key: 'place', type: 'worker_places' }),
    q({ key: 'start', type: 'time' }),
    q({ key: 'end', type: 'time' }),
  ];
  const { record, keys } = buildWorklogRecord({ phone: '555', name: 'John' }, questions,
    { place: 'Warehouse', start: '08:00', end: '16:30' }, now);
  assert.equal(record.phone, '555');
  assert.equal(record.place, 'Warehouse');
  assert.equal(record.hours, '8.5');
  assert.deepEqual(keys, ['place', 'start', 'end']);
});

test('no hours column when no start/end time pair', () => {
  const questions = [q({ key: 'place', type: 'worker_places' })];
  const { record } = buildWorklogRecord({ phone: '5', name: 'J' }, questions, { place: 'W' }, now);
  assert.equal(record.hours, undefined);
});
