import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySessionStore, type Session } from './session-store.ts';
import type { Worker } from '@scourage/worklog-core';

const worker: Worker = { phone: '555', name: 'John', greeting: '', places: [], active: true };
const sess = (updatedAt: number): Session => ({ worker, questions: [], index: 0, answers: {}, updatedAt });

test('stores and clears', () => {
  let t = 1000;
  const store = createMemorySessionStore(30_000, () => new Date(t));
  store.set('555', sess(t));
  assert.equal(store.get('555')?.worker.name, 'John');
  store.clear('555');
  assert.equal(store.get('555'), undefined);
});

test('expires after ttl', () => {
  let t = 1000;
  const store = createMemorySessionStore(30_000, () => new Date(t));
  store.set('555', sess(t));
  t = 1000 + 31_000;
  assert.equal(store.get('555'), undefined);
});
