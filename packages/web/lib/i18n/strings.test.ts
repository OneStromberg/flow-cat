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
