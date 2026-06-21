import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { listWorkerEntries, getEntry, updateEntry } from './entries.ts';
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';

const HEADER = ['logged_at', 'phone', 'name', 'id', 'place', 'date', 'start', 'end', 'hours', 'locked'];
const seed = () => ({
  WorkLogs: [
    HEADER,
    ['T1', '555', 'John', 'e1', 'Warehouse', '2026-06-19', '08:00', '16:00', '8', ''],
    ['T2', '555', 'John', 'e2', 'Office HQ', '2026-06-20', '09:00', '17:30', '8.5', 'yes'],
    ['T3', '999', 'Maria', 'e3', 'Warehouse', '2026-06-20', '08:00', '12:00', '4', ''],
  ],
});
const worker: Worker = { phone: '555', name: 'John', greeting: '', places: ['Warehouse', 'Office HQ'], active: true, teudatZeut: '1' };
const questions: Question[] = [
  { order: 1, key: 'place', type: 'worker_places', text: 'Where?', options: [], required: true },
  { order: 2, key: 'date', type: 'date', text: 'Day?', options: [], required: true },
  { order: 3, key: 'start', type: 'time', text: 'Start?', options: [], required: true },
  { order: 4, key: 'end', type: 'time', text: 'End?', options: [], required: true },
];
const now = new Date('2026-06-21T09:00:00Z');

test('lists only this worker entries, newest first', async () => {
  const g = createMemoryGateway(seed());
  const entries = await listWorkerEntries(g, '+1 555');
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((e) => e.id), ['e2', 'e1']); // newest (later row) first
  assert.equal(entries[0].locked, true);
});

test('getEntry finds by id', async () => {
  const g = createMemoryGateway(seed());
  assert.equal((await getEntry(g, 'e1'))?.values.place, 'Warehouse');
  assert.equal(await getEntry(g, 'nope'), null);
});

test('updateEntry edits an unlocked owned entry and recomputes hours', async () => {
  const g = createMemoryGateway(seed());
  const r = await updateEntry(g, 'e1', { place: 'Office HQ', date: '2026-06-19', start: '08:00', end: '12:00' }, worker, questions, 'Asia/Jerusalem', now);
  assert.deepEqual(r, { ok: true });
  const e = await getEntry(g, 'e1');
  assert.equal(e?.values.place, 'Office HQ');
  assert.equal(e?.values.hours, '4');
});

test('updateEntry refuses locked, wrong-owner, and not-found', async () => {
  const g = createMemoryGateway(seed());
  assert.deepEqual(await updateEntry(g, 'e2', { place: 'Warehouse', date: '2026-06-20', start: '09:00', end: '10:00' }, worker, questions, 'Asia/Jerusalem', now), { ok: false, reason: 'locked' });
  assert.deepEqual(await updateEntry(g, 'e3', { place: 'Warehouse', date: '2026-06-20', start: '08:00', end: '09:00' }, worker, questions, 'Asia/Jerusalem', now), { ok: false, reason: 'forbidden' });
  assert.deepEqual(await updateEntry(g, 'zzz', {}, worker, questions, 'Asia/Jerusalem', now), { ok: false, reason: 'not_found' });
});
