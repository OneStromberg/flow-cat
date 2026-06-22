import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway, type SheetsGateway } from '@scourage/sheets-helper';
import { handleMessage, type EngineDeps } from './engine.ts';
import { createMemorySessionStore } from './session-store.ts';
import { loadQuestions } from '@scourage/worklog-core';
import type { OutboundMessage, WhatsAppClient } from '../whatsapp/types.ts';

const DEFAULT_QUESTIONS = [
  ['order', 'key', 'type', 'text', 'options', 'required'],
  ['1', 'place', 'worker_places', 'Where did you work?', '', 'yes'],
  ['2', 'date', 'date', 'Which day?', '', 'yes'],
  ['3', 'start', 'time', 'Start time?', '', 'yes'],
  ['4', 'end', 'time', 'Finish time?', '', 'yes'],
];

function makeDeps(extraTabs: Record<string, string[][]> = {}) {
  const gateway = createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active'],
      ['15551230000', 'John', '', 'Warehouse, Office HQ', 'yes'],
    ],
    Questions: DEFAULT_QUESTIONS,
    WorkLogs: [['logged_at', 'phone', 'name', 'place', 'date', 'start', 'end', 'hours']],
    ...extraTabs,
  });
  const sent: { to: string; msg: OutboundMessage }[] = [];
  const whatsapp: WhatsAppClient = { async send(to, msg) { sent.push({ to, msg }); } };
  const now = () => new Date('2026-06-20T09:00:00Z');
  const deps: EngineDeps = {
    gateway,
    whatsapp,
    sessions: createMemorySessionStore(30 * 60_000, now),
    getQuestions: () => loadQuestions(gateway),
    tz: 'Asia/Jerusalem',
    now,
  };
  return { deps, gateway, sent };
}

const bodies = (sent: { msg: OutboundMessage }[]) =>
  sent.map((s) => s.msg.body);

test('unregistered phone is rejected', async () => {
  const { deps, sent } = makeDeps();
  await handleMessage(deps, { phone: '19999999999', text: 'hi' });
  assert.match(bodies(sent).join(' '), /not registered/i);
});

test('full happy path writes a WorkLog with computed hours', async () => {
  const { deps, gateway, sent } = makeDeps();
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });        // greet + ask place
  await handleMessage(deps, { phone: '15551230000', selectionId: 'opt_0' }); // Warehouse
  await handleMessage(deps, { phone: '15551230000', selectionId: 'date_today' });
  await handleMessage(deps, { phone: '15551230000', text: '08:00' });
  await handleMessage(deps, { phone: '15551230000', text: '16:30' });

  const log = gateway.dump().WorkLogs;
  assert.equal(log.length, 2);
  assert.deepEqual(log[1].slice(1), ['15551230000', 'John', 'Warehouse', '2026-06-20', '08:00', '16:30', '8.5']);
  assert.match(bodies(sent).at(-1)!, /Logged/);
});

test('overnight shift (finish before start) is accepted', async () => {
  const { deps, gateway } = makeDeps();
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'opt_0' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'date_today' });
  await handleMessage(deps, { phone: '15551230000', text: '22:00' });
  await handleMessage(deps, { phone: '15551230000', text: '06:00' });
  const log = gateway.dump().WorkLogs;
  assert.equal(log.length, 2);
  assert.equal(log[1][log[0].indexOf('hours')], '8');
});

test('identical start and finish is rejected', async () => {
  const { deps, sent } = makeDeps();
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'opt_0' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'date_today' });
  await handleMessage(deps, { phone: '15551230000', text: '09:00' });
  await handleMessage(deps, { phone: '15551230000', text: '09:00' });
  assert.match(bodies(sent).join(' '), /same time|can.t be the same/i);
});

test('reordered + extra question config is honored', async () => {
  const { deps, gateway } = makeDeps({
    Questions: [
      ['order', 'key', 'type', 'text', 'options', 'required'],
      ['1', 'place', 'worker_places', 'Where?', '', 'yes'],
      ['2', 'crew', 'choice', 'Crew size?', '1, 2, 3', 'yes'],
    ],
    WorkLogs: [['logged_at', 'phone', 'name', 'place', 'crew', 'hours']],
  });
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'opt_1' }); // Office HQ
  await handleMessage(deps, { phone: '15551230000', selectionId: 'opt_2' }); // crew = 3
  const log = gateway.dump().WorkLogs;
  assert.deepEqual(log[1].slice(1), ['15551230000', 'John', 'Office HQ', '3', '']);
});

test('cancel resets the session', async () => {
  const { deps, sent } = makeDeps();
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  await handleMessage(deps, { phone: '15551230000', text: 'cancel' });
  assert.match(bodies(sent).join(' '), /cancel/i);
});

test('invalid Questions config tells worker it is not set up', async () => {
  const { deps, sent } = makeDeps({
    Questions: [['order', 'key', 'type', 'text', 'options', 'required']], // empty
  });
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  assert.match(bodies(sent).join(' '), /not set up/i);
});

test('save failure sends retry message, next message re-finalizes and writes log', async () => {
  const mem = createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active'],
      ['15551230000', 'John', '', 'Warehouse, Office HQ', 'yes'],
    ],
    Questions: DEFAULT_QUESTIONS,
    WorkLogs: [['logged_at', 'phone', 'name', 'place', 'date', 'start', 'end', 'hours']],
  });
  let failOnce = true;
  const gateway: SheetsGateway = {
    readTab: mem.readTab.bind(mem),
    writeHeaderRow: mem.writeHeaderRow.bind(mem),
    updateRow: mem.updateRow.bind(mem),
    async appendRow(tab, row) {
      if (failOnce) {
        failOnce = false;
        throw new Error('boom');
      }
      return mem.appendRow(tab, row);
    },
  };
  const sent: { to: string; msg: OutboundMessage }[] = [];
  const whatsapp: WhatsAppClient = { async send(to, msg) { sent.push({ to, msg }); } };
  const now = () => new Date('2026-06-20T09:00:00Z');
  const deps: EngineDeps = {
    gateway,
    whatsapp,
    sessions: createMemorySessionStore(30 * 60_000, now),
    getQuestions: () => loadQuestions(gateway),
    tz: 'Asia/Jerusalem',
    now,
  };

  // Drive happy-path conversation to the final answer
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'opt_0' }); // Warehouse
  await handleMessage(deps, { phone: '15551230000', selectionId: 'date_today' });
  await handleMessage(deps, { phone: '15551230000', text: '08:00' });
  await handleMessage(deps, { phone: '15551230000', text: '16:30' }); // triggers save → fails

  // (a) SAVE_FAILED message was sent
  assert.match(bodies(sent).join(' '), /couldn't save|send your last answer again/i);
  // (b) no WorkLog row written yet (only header row)
  assert.equal(mem.dump().WorkLogs.length, 1);

  // (c) one more message re-finalizes and the WorkLog row now exists
  await handleMessage(deps, { phone: '15551230000', text: 'retry' });
  const log = mem.dump().WorkLogs;
  assert.equal(log.length, 2);
  assert.deepEqual(log[1].slice(1), ['15551230000', 'John', 'Warehouse', '2026-06-20', '08:00', '16:30', '8.5']);
});

test('optional question answered with skip stores empty and completes', async () => {
  const optionalQuestions = [
    ['order', 'key', 'type', 'text', 'options', 'required'],
    ['1', 'place', 'worker_places', 'Where did you work?', '', 'yes'],
    ['2', 'note', 'text', 'Any notes?', '', 'no'],
  ];
  const gateway = createMemoryGateway({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active'],
      ['15551230000', 'John', '', 'Warehouse, Office HQ', 'yes'],
    ],
    Questions: optionalQuestions,
    WorkLogs: [['logged_at', 'phone', 'name', 'place', 'note']],
  });
  const sent: { to: string; msg: OutboundMessage }[] = [];
  const whatsapp: WhatsAppClient = { async send(to, msg) { sent.push({ to, msg }); } };
  const now = () => new Date('2026-06-20T09:00:00Z');
  const deps: EngineDeps = {
    gateway,
    whatsapp,
    sessions: createMemorySessionStore(30 * 60_000, now),
    getQuestions: () => loadQuestions(gateway),
    tz: 'Asia/Jerusalem',
    now,
  };

  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  await handleMessage(deps, { phone: '15551230000', selectionId: 'opt_0' }); // Warehouse
  await handleMessage(deps, { phone: '15551230000', text: 'skip' });         // skip optional note

  const log = gateway.dump().WorkLogs;
  assert.equal(log.length, 2);
  // note column should be empty string
  assert.equal(log[1][4], '');
  assert.match(bodies(sent).at(-1)!, /Logged/);
});

test('inactive worker gets NOT_REGISTERED message', async () => {
  const { deps, sent } = makeDeps({
    Workers: [
      ['phone', 'name', 'greeting', 'places', 'active'],
      ['15551230000', 'John', '', 'Warehouse', 'no'],
    ],
  });
  await handleMessage(deps, { phone: '15551230000', text: 'hi' });
  assert.match(bodies(sent).join(' '), /not registered/i);
});
