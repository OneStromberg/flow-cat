import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toGraphPayload } from './cloud-api-client.ts';

test('maps text', () => {
  const p = toGraphPayload('555', { kind: 'text', body: 'hi' }) as any;
  assert.equal(p.to, '555');
  assert.equal(p.type, 'text');
  assert.equal(p.text.body, 'hi');
});

test('maps buttons (interactive)', () => {
  const p = toGraphPayload('555', {
    kind: 'buttons',
    body: 'Which day?',
    buttons: [{ id: 'date_today', title: 'Today' }],
  }) as any;
  assert.equal(p.type, 'interactive');
  assert.equal(p.interactive.type, 'button');
  assert.equal(p.interactive.action.buttons[0].reply.id, 'date_today');
});

test('maps list (interactive)', () => {
  const p = toGraphPayload('555', {
    kind: 'list',
    body: 'Where?',
    rows: [{ id: 'opt_0', title: 'Warehouse' }],
  }) as any;
  assert.equal(p.interactive.type, 'list');
  assert.equal(p.interactive.action.sections[0].rows[0].id, 'opt_0');
});

test('truncates button title to 20 chars', () => {
  const longTitle = 'A'.repeat(25);
  const p = toGraphPayload('555', {
    kind: 'buttons',
    body: 'Pick one',
    buttons: [{ id: 'btn_0', title: longTitle }],
  }) as any;
  assert.equal(p.interactive.action.buttons[0].reply.title.length, 20);
});

test('truncates list row title to 24 chars', () => {
  const longTitle = 'B'.repeat(30);
  const p = toGraphPayload('555', {
    kind: 'list',
    body: 'Pick one',
    rows: [{ id: 'row_0', title: longTitle }],
  }) as any;
  assert.equal(p.interactive.action.sections[0].rows[0].title.length, 24);
});
