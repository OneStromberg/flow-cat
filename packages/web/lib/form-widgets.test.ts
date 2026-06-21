import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionToWidget } from './form-widgets.ts';
import type { Question, Worker } from '@scourage/worklog-core';

const worker: Worker = { phone: '5', name: 'J', greeting: '', places: ['Warehouse', 'Office HQ'], active: true, teudatZeut: '' };
const q = (o: Partial<Question>): Question => ({ order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...o });

test('worker_places -> select of worker places', () => {
  assert.deepEqual(questionToWidget(q({ key: 'place', type: 'worker_places', text: 'Where?' }), worker),
    { key: 'place', label: 'Where?', required: true, kind: 'select', options: ['Warehouse', 'Office HQ'] });
});

test('choice -> select of options; date/time/number/text map by kind', () => {
  assert.equal(questionToWidget(q({ type: 'choice', options: ['a', 'b'] }), worker).kind, 'select');
  assert.equal(questionToWidget(q({ type: 'date' }), worker).kind, 'date');
  assert.equal(questionToWidget(q({ type: 'time' }), worker).kind, 'time');
  assert.equal(questionToWidget(q({ type: 'number' }), worker).kind, 'number');
  assert.equal(questionToWidget(q({ type: 'text' }), worker).kind, 'text');
});
