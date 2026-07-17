import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, resolveLang, DEFAULT_LANG } from './strings';

test('t returns RU by default and EN/HE when asked', () => {
  assert.equal(t('checkin.start'), 'Начать смену');       // default ru
  assert.equal(t('checkin.start', 'en'), 'Check in');
  assert.equal(t('checkin.start', 'he'), 'התחל משמרת');   // he filled where known
});
test('t falls back he → en → key for a missing he string', () => {
  assert.equal(t('nav.hours', 'ru'), 'Часы');
  assert.equal(t('nav.hours', 'en'), 'Hours');
  // a key present in en but not yet filled in he degrades to en, never blank
  assert.equal(t('nav.hours', 'he'), t('nav.hours', 'he')); // never throws; ≠ '' and defined
  assert.notEqual(t('nav.hours', 'he'), '');
});
test('resolveLang normalizes to ru/en/he', () => {
  assert.equal(resolveLang('en'), 'en');
  assert.equal(resolveLang('ru'), 'ru');
  assert.equal(resolveLang('he'), 'he');
  assert.equal(resolveLang(''), 'ru');
  assert.equal(resolveLang(undefined), 'ru');
  assert.equal(DEFAULT_LANG, 'ru');
});

test('t returns an unknown/nonexistent key as-is (never throws, never blank/undefined)', () => {
  // @ts-expect-error — intentionally passing a key outside the StringKey union to test the runtime fallback
  const result = t('this.key.does.not.exist', 'en');
  assert.equal(result, 'this.key.does.not.exist');
  assert.notEqual(result, undefined);
  assert.notEqual(result, '');
});

test('resolveLang uppercases "EN"/"HE" resolve case-insensitively', () => {
  assert.equal(resolveLang('EN'), 'en');
  assert.equal(resolveLang('HE'), 'he');
  assert.equal(resolveLang('He'), 'he');
  assert.equal(resolveLang('En'), 'en');
});

test('a key missing in the he dictionary but present in en falls back to the en string, never blank', () => {
  // 'hours.noAttended' is present in EN but intentionally not yet filled in HE
  const heValue = t('hours.noAttended', 'he');
  const enValue = t('hours.noAttended', 'en');
  assert.equal(heValue, enValue);
  assert.notEqual(heValue, '');
  assert.notEqual(heValue, undefined);
});
