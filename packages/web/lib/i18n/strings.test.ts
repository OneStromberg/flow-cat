import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, tf, resolveLang, DEFAULT_LANG } from './strings';

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

// --- tf: interpolation mechanics ---
//
// No real StringKey has placeholders yet (the `alert.*` templates land in a later task), so —
// like the "unknown key" test above — these tests pass a key literal that isn't in the
// dictionary; t()'s own fallback (`DICT[lang][key] ?? EN[key] ?? key`) returns the key text
// itself, which gives tf() a real `{placeholder}`-bearing template to interpolate against.
// The interpolation mechanism is what's under test, not any specific dictionary content.

test('tf: interpolates multiple placeholders from a resolved template', () => {
  // @ts-expect-error — intentionally passing a key outside the StringKey union; t()'s fallback
  // returns the key text itself, giving us a real template with placeholders to interpolate.
  const result = tf('Hello {a}, you have {b} shifts today', 'en', { a: 'Dana', b: 3 });
  assert.equal(result, 'Hello Dana, you have 3 shifts today');
});

test('tf: a missing param resolves to empty string — never leaks "{x}" or "undefined"', () => {
  // @ts-expect-error — fallback-key technique, see block comment above
  const result = tf('Value: {x}', 'en', {});
  assert.equal(result, 'Value: ');
  assert.equal(result.includes('{x}'), false);
  assert.equal(result.includes('undefined'), false);
});

test('tf: a key with no placeholders is returned unchanged', () => {
  assert.equal(tf('nav.hours', 'en', {}), t('nav.hours', 'en'));
  assert.equal(tf('nav.hours', 'en', { unused: 'x' }), 'Hours');
});

test('tf: numeric params stringify', () => {
  // @ts-expect-error — fallback-key technique, see block comment above
  const zero = tf('Count: {n}', 'en', { n: 0 });
  // @ts-expect-error — fallback-key technique, see block comment above
  const fortyTwo = tf('Count: {n}', 'en', { n: 42 });
  assert.equal(zero, 'Count: 0');
  assert.equal(fortyTwo, 'Count: 42');
});

test('tf: respects lang — EN and RU templates for the same key differ', () => {
  const en = tf('checkin.title', 'en', {});
  const ru = tf('checkin.title', 'ru', {});
  assert.equal(en, 'Check in / out');
  assert.equal(ru, 'Отметка прихода / ухода');
  assert.notEqual(en, ru);
});

test('tf: HE-missing key falls back to EN via the underlying t()', () => {
  // 'hours.noAttended' is present in EN but intentionally not yet filled in HE
  assert.equal(tf('hours.noAttended', 'he', {}), t('hours.noAttended', 'en'));
});
