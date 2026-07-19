import { test } from 'node:test';
import assert from 'node:assert/strict';
import { purgeWorkerCaches } from './clear-client-cache';

function makeFakeCache(urls: string[]) {
  const entries = new Set(urls);
  return {
    keys: async () => Array.from(entries).map((url) => ({ url })),
    delete: async (req: { url: string }) => entries.delete(req.url),
  };
}

test('purgeWorkerCaches removes only /api/worker/ and /app/ entries, leaves the precache/offline shell alone', async () => {
  const apis = makeFakeCache([
    'https://x.test/api/worker/hours',
    'https://x.test/api/worker/profile',
    'https://x.test/api/other',
  ]);
  const pages = makeFakeCache(['https://x.test/app/hours', 'https://x.test/app/checkin']);
  const precache = makeFakeCache([
    // Hashed webpack chunk path — contains the substring "/app/" but is NOT
    // a worker-scoped page/API URL; a naive `.includes('/app/')` would wipe
    // this and break the offline shell.
    'https://x.test/_next/static/chunks/app/checkin/page-abc123.js',
    'https://x.test/~offline',
  ]);

  const cacheMap = new Map<string, ReturnType<typeof makeFakeCache>>([
    ['apis', apis],
    ['pages', pages],
    ['serwist-precache-v2', precache],
  ]);

  const fakeCacheStorage = {
    keys: async () => Array.from(cacheMap.keys()),
    open: async (name: string) => cacheMap.get(name)!,
  };

  await purgeWorkerCaches(fakeCacheStorage as unknown as CacheStorage);

  assert.deepEqual(await apis.keys(), [{ url: 'https://x.test/api/other' }]);
  assert.deepEqual(await pages.keys(), []);

  const precacheUrls = (await precache.keys()).map((r) => r.url).sort();
  assert.deepEqual(precacheUrls, [
    'https://x.test/_next/static/chunks/app/checkin/page-abc123.js',
    'https://x.test/~offline',
  ]);
});

test('purgeWorkerCaches is a no-op when there are no caches', async () => {
  const fakeCacheStorage = {
    keys: async () => [] as string[],
    open: async () => {
      throw new Error('should never be called');
    },
  };

  await assert.doesNotReject(() => purgeWorkerCaches(fakeCacheStorage as unknown as CacheStorage));
});
