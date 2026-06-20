import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { loadQuestions } from './load-questions.ts';

test('loads, parses, and sorts questions', async () => {
  const g = createMemoryGateway({
    Questions: [
      ['order', 'key', 'type', 'text', 'options', 'required'],
      ['2', 'date', 'date', 'Which day?', '', ''],
      ['1', 'place', 'worker_places', 'Where?', '', 'yes'],
      ['3', 'crew', 'choice', 'Crew size?', '1, 2, 3', 'no'],
      ['', '', '', 'blank row ignored', '', ''],
    ],
  });
  const qs = await loadQuestions(g);
  assert.deepEqual(qs.map((q) => q.key), ['place', 'date', 'crew']);
  assert.deepEqual(qs[2].options, ['1', '2', '3']);
  assert.equal(qs[0].required, true);
  assert.equal(qs[2].required, false);
});
