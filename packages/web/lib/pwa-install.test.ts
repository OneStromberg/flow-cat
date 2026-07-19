import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform } from './pwa-install';

// Representative user-agent strings.
const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  androidFirefox:
    'Mozilla/5.0 (Android 13; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  ipadSafari:
    'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  desktopSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
};

test('installed wins via standalone display-mode regardless of UA', () => {
  assert.equal(detectPlatform({ userAgent: UA.androidChrome }, true), 'installed');
  assert.equal(detectPlatform({ userAgent: UA.desktopChrome }, true), 'installed');
});

test('installed wins via iOS navigator.standalone === true', () => {
  assert.equal(detectPlatform({ userAgent: UA.iphoneSafari, standalone: true }, false), 'installed');
});

test('android Chromium (not standalone) → android', () => {
  assert.equal(detectPlatform({ userAgent: UA.androidChrome }, false), 'android');
  assert.equal(detectPlatform({ userAgent: UA.androidSamsung }, false), 'android');
});

test('Firefox on Android is not a beforeinstallprompt candidate → unsupported', () => {
  assert.equal(detectPlatform({ userAgent: UA.androidFirefox }, false), 'unsupported');
});

test('iOS Safari (iPhone/iPad, not standalone) → ios', () => {
  assert.equal(detectPlatform({ userAgent: UA.iphoneSafari, standalone: false }, false), 'ios');
  assert.equal(detectPlatform({ userAgent: UA.ipadSafari }, false), 'ios');
});

test('desktop browsers → unsupported', () => {
  assert.equal(detectPlatform({ userAgent: UA.desktopChrome }, false), 'unsupported');
  assert.equal(detectPlatform({ userAgent: UA.desktopSafari }, false), 'unsupported');
});

test('empty / garbage UA → unsupported (never throws)', () => {
  assert.equal(detectPlatform({ userAgent: '' }, false), 'unsupported');
  assert.equal(detectPlatform({ userAgent: 'totally-not-a-browser' }, false), 'unsupported');
});
