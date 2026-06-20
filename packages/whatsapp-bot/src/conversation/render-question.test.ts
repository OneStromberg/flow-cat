import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderQuestion } from './render-question.ts';
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';

const worker: Worker = { phone: '555', name: 'John', greeting: '', places: ['Warehouse', 'Office HQ'], active: true };
const q = (o: Partial<Question>): Question => ({ order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...o });

test('worker_places renders a list of the worker places', () => {
  const m = renderQuestion(q({ type: 'worker_places', text: 'Where?' }), worker);
  assert.equal(m.kind, 'list');
  if (m.kind === 'list') {
    assert.deepEqual(m.rows, [
      { id: 'opt_0', title: 'Warehouse' },
      { id: 'opt_1', title: 'Office HQ' },
    ]);
  }
});

test('date renders three buttons', () => {
  const m = renderQuestion(q({ type: 'date', text: 'Which day?' }), worker);
  assert.equal(m.kind, 'buttons');
  if (m.kind === 'buttons') {
    assert.deepEqual(m.buttons.map((b) => b.id), ['date_today', 'date_yesterday', 'date_other']);
  }
});

test('optional text mentions skip', () => {
  const m = renderQuestion(q({ type: 'text', text: 'Notes?', required: false }), worker);
  assert.equal(m.kind, 'text');
  if (m.kind === 'text') assert.match(m.body, /skip/i);
});
