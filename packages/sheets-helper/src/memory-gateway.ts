import type { SheetsGateway } from './gateway.ts';

export function createMemoryGateway(
  initial: Record<string, string[][]> = {},
): SheetsGateway & { dump(): Record<string, string[][]> } {
  const tabs: Record<string, string[][]> = structuredClone(initial);
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
    dump() {
      return tabs;
    },
  };
}
