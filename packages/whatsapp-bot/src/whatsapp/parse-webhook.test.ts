import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWebhook } from './parse-webhook.ts';

const wrap = (message: unknown) => ({
  entry: [{ changes: [{ value: { messages: [message] } }] }],
});

test('parses a text message', () => {
  const r = parseWebhook(wrap({ from: '15551230000', type: 'text', text: { body: 'hi' } }));
  assert.deepEqual(r, { phone: '15551230000', text: 'hi' });
});

test('parses an interactive list reply', () => {
  const r = parseWebhook(
    wrap({
      from: '15551230000',
      type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: 'opt_2', title: 'Office HQ' } },
    }),
  );
  assert.deepEqual(r, { phone: '15551230000', text: 'Office HQ', selectionId: 'opt_2' });
});

test('returns null for status/non-message payloads', () => {
  assert.equal(parseWebhook({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }), null);
  assert.equal(parseWebhook({}), null);
});
