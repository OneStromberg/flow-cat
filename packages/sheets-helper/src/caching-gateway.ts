import type { SheetsGateway } from './gateway.ts';

/**
 * Wraps a gateway with a request-scoped read cache: each tab is read from the
 * backend at most once per wrapper instance, and the result is reused for every
 * subsequent `readTab` of that tab. Any write (writeHeaderRow/appendRow/
 * updateRow) invalidates that tab's cached read so later reads see fresh data.
 *
 * Create ONE per request (e.g. per server-page render) — it eliminates the N+1
 * read patterns (listAssignments-per-instance, listAttendance-per-worker, etc.)
 * that otherwise blow the Google Sheets per-minute read quota.
 */
export function createCachingGateway(inner: SheetsGateway): SheetsGateway {
  const cache = new Map<string, Promise<string[][]>>();
  return {
    readTab(tab) {
      let p = cache.get(tab);
      if (!p) {
        p = inner.readTab(tab);
        cache.set(tab, p);
      }
      return p;
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
