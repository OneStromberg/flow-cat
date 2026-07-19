// Purges per-worker client-side state on logout so a shared device never
// leaks the previous worker's data (including Profile's Telegram connect
// state) into the next worker's session. Two things to clear:
//
//  1. The sessionStorage-backed SWR cache (see swr-session-cache.ts).
//  2. The service worker's runtime caches for worker-scoped requests: the
//     Serwist `defaultCache` NetworkFirst `apis` cache (all `/api/*` GETs,
//     including `/api/worker/*`) and the `pages`/`pages-rsc*` page caches
//     under `/app/*`. Deliberately surgical — only entries whose pathname
//     starts with `/api/worker/` or `/app/` are removed; the precache /
//     offline-shell (hashed JS/CSS chunks, `/~offline`) is never touched.
//     (A hashed chunk path can itself contain the substring "/app/" —
//     `/_next/static/chunks/app/checkin/page-<hash>.js` — so matching is
//     done on the parsed pathname, not a raw string `.includes()`.)
//
// `purgeWorkerCaches` is the testable core — it only depends on the
// `CacheStorage`/`Cache` surface it's handed, so it can run against an
// in-memory fake instead of a real browser `caches` object.

const SWR_CACHE_KEY = 'flowcat-swr-cache';

function isWorkerScopedUrl(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  return pathname.startsWith('/api/worker/') || pathname.startsWith('/app/');
}

export async function purgeWorkerCaches(cacheStorage: CacheStorage): Promise<void> {
  const names = await cacheStorage.keys();
  await Promise.all(
    names.map(async (name) => {
      const cache = await cacheStorage.open(name);
      const requests = await cache.keys();
      await Promise.all(
        requests.filter((req) => isWorkerScopedUrl(req.url)).map((req) => cache.delete(req)),
      );
    }),
  );
}

/**
 * SSR-safe, best-effort purge of the two per-worker caches. Never throws —
 * a cache-purge failure must never block logout (the logout POST + cookie
 * clear + redirect are the parts that actually matter for security).
 */
export async function clearClientCache(): Promise<void> {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SWR_CACHE_KEY);
    }
  } catch {
    // Corrupt/unavailable sessionStorage — nothing to purge, move on.
  }

  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      await purgeWorkerCaches(window.caches);
    }
  } catch {
    // Cache-purge failure must never block logout.
  }
}
