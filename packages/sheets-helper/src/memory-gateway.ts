import type { SheetsGateway } from './gateway.ts';

export function createMemoryGateway(
  initial: Record<string, string[][]> = {},
): SheetsGateway & { dump(): Record<string, string[][]> } {
  const tabs: Record<string, string[][]> = structuredClone(initial);
  // Closure-scoped claim ledger (key → last-claimed ms). JS is single-threaded,
  // so this read-then-write is atomic with respect to other synchronous calls.
  const claims = new Map<string, number>();
  return {
    async readTab(tab) {
      return tabs[tab] ?? [];
    },
    async writeHeaderRow(tab, headers) {
      const t = (tabs[tab] ??= []);
      t[0] = [...headers];
    },
    async appendRow(tab, row) {
      (tabs[tab] ??= []).push([...row]);
    },
    async updateRow(tab, rowNumber, row) {
      const t = (tabs[tab] ??= []);
      t[rowNumber - 1] = [...row];
    },
    async tryClaim(key, ttlMs, nowMs) {
      const now = nowMs ?? Date.now();
      const last = claims.get(key);
      if (last === undefined || now - last >= ttlMs) {
        claims.set(key, now);
        return true;
      }
      return false;
    },
    dump() {
      return tabs;
    },
  };
}
