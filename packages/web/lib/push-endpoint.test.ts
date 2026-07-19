import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedPushEndpoint } from './push-endpoint';

test('accepts a real FCM endpoint', () => {
  assert.equal(
    isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc123'),
    true,
  );
});

test('accepts a real Mozilla push endpoint', () => {
  assert.equal(
    isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc123'),
    true,
  );
});

test('accepts a real Apple web push endpoint', () => {
  assert.equal(
    isAllowedPushEndpoint('https://web.push.apple.com/QAbc123'),
    true,
  );
});

test('rejects http (non-https) even on an allowlisted host', () => {
  assert.equal(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc123'), false);
});

test('rejects an arbitrary non-allowlisted host', () => {
  assert.equal(isAllowedPushEndpoint('https://evil.example.com/collect'), false);
});

test('rejects an internal host with a port (SSRF target)', () => {
  assert.equal(isAllowedPushEndpoint('https://internal-host:8080/x'), false);
});

test('rejects a suffix-spoofed lookalike host', () => {
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.com/fcm/send/abc123'), false);
});

test('rejects non-URL garbage', () => {
  assert.equal(isAllowedPushEndpoint('not a url'), false);
  assert.equal(isAllowedPushEndpoint(''), false);
});
