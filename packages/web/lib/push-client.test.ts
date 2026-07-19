import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlBase64ToUint8Array } from './push-client';

test('decodes a standard (non-URL-safe) base64 string', () => {
  // "hello" in base64
  const out = urlBase64ToUint8Array('aGVsbG8=');
  assert.deepEqual(Array.from(out), [104, 101, 108, 108, 111]);
});

test('decodes URL-safe base64 (- and _ instead of + and /)', () => {
  // bytes [0xfb, 0xff, 0xbf] base64-encode to "-_+/" in standard form and
  // "-_-_" in URL-safe form — round-trip through both to prove the swap.
  const standard = Buffer.from([0xfb, 0xff, 0xbf]).toString('base64');
  const urlSafe = standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.deepEqual(Array.from(urlBase64ToUint8Array(urlSafe)), [0xfb, 0xff, 0xbf]);
});

test('pads inputs missing their trailing "=" (raw VAPID keys have no padding)', () => {
  // "hello" without the trailing "=" padding that generateVAPIDKeys()-style
  // output omits.
  const out = urlBase64ToUint8Array('aGVsbG8');
  assert.deepEqual(Array.from(out), [104, 101, 108, 108, 111]);
});

test('empty string decodes to an empty array', () => {
  assert.deepEqual(Array.from(urlBase64ToUint8Array('')), []);
});

test('round-trips a realistic 65-byte VAPID public key length', () => {
  const raw = new Uint8Array(65).map((_, i) => i * 4);
  const base64Safe = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  assert.deepEqual(Array.from(urlBase64ToUint8Array(base64Safe)), Array.from(raw));
});
