import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { submitWorklog } from './submit-worklog.ts';
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';

const q = (o: Partial<Question>): Question => ({ order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...o });
const worker: Worker = { phone: '555', name: 'John', greeting: '', places: ['Warehouse'], active: true, teudatZeut: '' };
const questions = [q({ key: 'place', type: 'worker_places' }), q({ key: 'start', type: 'time' }), q({ key: 'end', type: 'time' })];
const now = new Date('2026-06-20T09:00:00Z');

test('valid submit appends a WorkLog row with id, hours, and empty locked', async () => {
  const g = createMemoryGateway({ WorkLogs: [['logged_at', 'phone', 'name', 'place', 'start', 'end', 'hours']] });
  const r = await submitWorklog(g, worker, questions, { place: 'Warehouse', start: '08:00', end: '16:30' }, 'Asia/Jerusalem', now);
  assert.deepEqual(r, { ok: true, hours: '8.5' });
  const log = g.dump().WorkLogs;
  const header = log[0];
  const row = log[1];
  const get = (k: string) => row[header.indexOf(k)];
  assert.equal(get('phone'), '555');
  assert.equal(get('place'), 'Warehouse');
  assert.equal(get('hours'), '8.5');
  assert.equal(get('locked'), '');
  assert.match(get('id'), /.+/); // id was generated and written
  assert.ok(header.includes('id') && header.includes('locked'));
});

test('invalid submit returns errors and writes nothing', async () => {
  const g = createMemoryGateway({ WorkLogs: [['logged_at', 'phone', 'name', 'place', 'start', 'end', 'hours']] });
  const r = await submitWorklog(g, worker, questions, { place: 'Nope', start: '08:00', end: '16:30' }, 'Asia/Jerusalem', now);
  assert.equal(r.ok, false);
  assert.equal(g.dump().WorkLogs.length, 1);
});
