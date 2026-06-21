import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { createConsoleClient } from '../whatsapp/console-client.ts';
import { createMemorySessionStore } from './session-store.ts';
import { loadQuestions } from '@scourage/worklog-core';
import { handleMessage, type EngineDeps } from './engine.ts';

test('console transport drives a full conversation end to end', async () => {
  const gateway = createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active'],
      ['15551230000', 'John', 'Welcome back John!', 'Warehouse, Office HQ', 'yes'],
    ],
    Questions: [
      ['order', 'key', 'type', 'text', 'options', 'required'],
      ['1', 'place', 'worker_places', 'Where did you work?', '', 'yes'],
      ['2', 'date', 'date', 'Which day?', '', 'yes'],
      ['3', 'start', 'time', 'Start time?', '', 'yes'],
      ['4', 'end', 'time', 'Finish time?', '', 'yes'],
    ],
    WorkLogs: [['logged_at', 'phone', 'name', 'place', 'date', 'start', 'end', 'hours']],
  });

  const lines: string[] = [];
  const now = () => new Date('2026-06-20T09:00:00Z');
  const deps: EngineDeps = {
    gateway,
    whatsapp: createConsoleClient((l) => lines.push(l)),
    sessions: createMemorySessionStore(30 * 60_000, now),
    getQuestions: () => loadQuestions(gateway),
    tz: 'Asia/Jerusalem',
    now,
  };

  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  await handleMessage(deps, { phone: '15551230000', text: '1' });          // Warehouse
  await handleMessage(deps, { phone: '15551230000', text: 'today' });
  await handleMessage(deps, { phone: '15551230000', text: '08:00' });
  await handleMessage(deps, { phone: '15551230000', text: '16:30' });

  const transcript = lines.join('\n');
  assert.match(transcript, /Welcome back John!/);
  assert.match(transcript, /Logged ✅/);

  const row = gateway.dump().WorkLogs[1];
  assert.deepEqual(row.slice(1), ['15551230000', 'John', 'Warehouse', '2026-06-20', '08:00', '16:30', '8.5']);
});
