import type { SheetsGateway } from './gateway.ts';

/**
 * Cross-request read cache with a short TTL. A tab read is reused for up to
 * `ttlMs` across requests; any write (header/append/update) invalidates that
 * tab immediately so the app always reflects its own writes. Safe for this
 * codebase because rows are append-only + soft-deleted (never reordered/removed),
 * so a slightly-stale read never yields a wrong row index — at worst it misses a
 * just-appended row for a few seconds.
 *
 * Wrap the single backend gateway with this so bursts of navigation don't blow
 * the Google Sheets per-minute read quota. `now` is injectable for tests.
 */
export function createTtlCachingGateway(
  inner: SheetsGateway,
  ttlMs = 10000,
  now: () => number = () => Date.now(),
): SheetsGateway {
  const cache = new Map<string, { at: number; rows: Promise<string[][]> }>();
  return {
    readTab(tab) {
      const e = cache.get(tab);
      if (e && now() - e.at < ttlMs) return e.rows;
      const rows = inner.readTab(tab);
      cache.set(tab, { at: now(), rows });
      return rows;
    },
    async writeHeaderRow(tab, headers) {
      cache.delete(tab);
      return inner.writeHeaderRow(tab, headers);
    },
    async appendRow(tab, row) {
      cache.delete(tab);
      return inner.appendRow(tab, row);
    },
    async updateRow(tab, rowNumber, row) {
      cache.delete(tab);
      return inner.updateRow(tab, rowNumber, row);
    },
  };
}
