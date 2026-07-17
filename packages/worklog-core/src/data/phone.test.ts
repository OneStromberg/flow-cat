import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, toE164 } from './phone.ts';

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

test('canonicalizes Israeli numbers to 972…', () => {
  assert.equal(normalizePhone('050-123-4567'), '972501234567');
  assert.equal(normalizePhone('0501234567'), '972501234567');
  assert.equal(normalizePhone('+972 50 123 4567'), '972501234567');
  assert.equal(normalizePhone('00972501234567'), '972501234567');
  assert.equal(normalizePhone('972501234567'), '972501234567');
  assert.equal(normalizePhone('15551230000'), '15551230000'); // non-0-leading untouched
});

test('toE164 prepends + so Telegram auto-links', () => {
  assert.equal(toE164(normalizePhone('050-123-4567')), '+972501234567');
  assert.equal(toE164('972501234567'), '+972501234567');
  assert.equal(toE164(''), '');
});
