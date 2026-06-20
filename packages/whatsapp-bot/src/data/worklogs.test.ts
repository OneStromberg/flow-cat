import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { appendWorkLog } from './worklogs.ts';

test('appends aligned to existing header', async () => {
  const g = createMemoryGateway({
    WorkLogs: [['logged_at', 'phone', 'name', 'place', 'date', 'start', 'end', 'hours']],
  });
  await appendWorkLog(
    g,
    { logged_at: 'T', phone: '555', name: 'John', place: 'Warehouse', date: '2026-06-20', start: '08:00', end: '16:30', hours: '8.5' },
    ['place', 'date', 'start', 'end'],
  );
  assert.deepEqual(g.dump().WorkLogs[1], ['T', '555', 'John', 'Warehouse', '2026-06-20', '08:00', '16:30', '8.5']);
});

test('adds missing columns for a new question key', async () => {
  const g = createMemoryGateway({
    WorkLogs: [['logged_at', 'phone', 'name', 'place', 'hours']],
  });
  await appendWorkLog(
    g,
    { logged_at: 'T', phone: '555', name: 'John', place: 'Warehouse', notes: 'late start' },
    ['place', 'notes'],
  );
  assert.deepEqual(g.dump().WorkLogs[0], ['logged_at', 'phone', 'name', 'place', 'hours', 'notes']);
  assert.deepEqual(g.dump().WorkLogs[1], ['T', '555', 'John', 'Warehouse', '', 'late start']);
});

test('initializes header when WorkLogs is empty', async () => {
  const g = createMemoryGateway({ WorkLogs: [] });
  await appendWorkLog(g, { logged_at: 'T', phone: '555', name: 'John', place: 'W' }, ['place']);
  assert.deepEqual(g.dump().WorkLogs[0], ['logged_at', 'phone', 'name', 'place', 'hours']);
});
