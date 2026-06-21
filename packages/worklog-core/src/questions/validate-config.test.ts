import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestions } from './validate-config.ts';
import type { Question } from './types.ts';

const q = (over: Partial<Question>): Question => ({
  order: 1, key: 'k', type: 'text', text: 'T', options: [], required: true, ...over,
});

test('valid config passes', () => {
  const r = validateQuestions([
    q({ key: 'place', type: 'worker_places', text: 'Where?' }),
    q({ key: 'start', type: 'time', text: 'Start?' }),
  ]);
  assert.deepEqual(r, { ok: true });
});

test('empty config fails', () => {
  assert.equal(validateQuestions([]).ok, false);
});

test('catches duplicate key, unknown type, empty choice, missing text', () => {
  const r = validateQuestions([
    q({ key: 'place', type: 'worker_places', text: 'Where?' }),
    q({ key: 'dup', type: 'text', text: 'A' }),
    q({ key: 'dup', type: 'nope' as never, text: '' }),
    q({ key: 'c', type: 'choice', text: 'C', options: [] }),
  ]);
  assert.equal(r.ok, false);
  if (!r.ok) {
    const blob = r.errors.join('|');
    assert.match(blob, /Duplicate key: dup/);
    assert.match(blob, /Unknown type "nope"/);
    assert.match(blob, /no options/);
    assert.match(blob, /no text/);
  }
});

test('requires exactly one worker_places', () => {
  assert.equal(validateQuestions([q({ key: 'a', type: 'text', text: 'A' })]).ok, false);
});
