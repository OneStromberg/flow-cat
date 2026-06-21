import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './phone.ts';

test('strips formatting to digits', () => {
  assert.equal(normalizePhone('+1 (555) 123-0000'), '15551230000');
  assert.equal(normalizePhone('  972-54-555-1234 '), '972545551234');
});

test('drops a leading 00 international prefix', () => {
  assert.equal(normalizePhone('0049 151 23456'), '4915123456');
});

test('empty stays empty', () => {
  assert.equal(normalizePhone(''), '');
});
