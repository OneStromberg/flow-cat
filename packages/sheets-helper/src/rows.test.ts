import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsToObjects, objectToRow } from './rows.ts';

test('rowsToObjects maps headers and pads ragged rows', () => {
  const rows = [
    ['phone', 'name', 'active'],
    ['555', 'John', 'yes'],
    ['556', 'Maria'], // ragged: missing active
  ];
  assert.deepEqual(rowsToObjects(rows), [
    { phone: '555', name: 'John', active: 'yes' },
    { phone: '556', name: 'Maria', active: '' },
  ]);
});

test('rowsToObjects returns [] for empty input', () => {
  assert.deepEqual(rowsToObjects([]), []);
});

test('objectToRow aligns to header order, missing keys blank', () => {
  assert.deepEqual(
    objectToRow({ name: 'John', phone: '555' }, ['phone', 'name', 'hours']),
    ['555', 'John', ''],
  );
});
