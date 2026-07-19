// sessionStorage-backed cache provider for SWR. Follows SWR's documented
// persistence pattern: https://swr.vercel.app/docs/advanced/cache
//
// Seeds a Map from sessionStorage on init so cached data survives
// client-side navigation within the same tab/session, and flushes the Map
// back to sessionStorage on `beforeunload` so it survives reloads too.
//
// SSR-safe: `window`/`sessionStorage` don't exist on the server, so this
// falls back to a plain in-memory Map there (never persisted, never reused
// across requests — just enough to satisfy SWR's `provider` contract).
const CACHE_KEY = 'flowcat-swr-cache';

// Typed `any` (not `unknown`) for the Map's value so this structurally
// satisfies SWR's `Cache<Data>` interface — `get()` must return
// `State<Data> | undefined`, and `unknown` isn't assignable to that.
export function sessionStorageProvider(): Map<string, any> {
  if (typeof window === 'undefined') {
    return new Map();
  }

  let entries: [string, any][] = [];
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      entries = JSON.parse(raw);
    }
  } catch {
    // Corrupt or unreadable cache — start fresh rather than throwing.
    entries = [];
  }

  const map = new Map<string, any>(entries);

  window.addEventListener('beforeunload', () => {
    try {
      const serialized = JSON.stringify(Array.from(map.entries()));
      sessionStorage.setItem(CACHE_KEY, serialized);
    } catch {
      // Oversized or unserializable cache (e.g. quota exceeded, circular
      // data) — drop the persist rather than throwing during unload.
    }
  });

  return map;
}
