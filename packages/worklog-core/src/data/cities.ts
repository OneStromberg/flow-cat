import { rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';

export async function loadCities(gateway: SheetsGateway): Promise<string[]> {
  const set = new Set<string>();
  for (const o of rowsToObjects(await gateway.readTab('Cities'))) {
    const c = (o.city_name ?? '').trim();
    if (c) set.add(c);
  }
  for (const o of rowsToObjects(await gateway.readTab('Workers'))) {
    const c = (o.city ?? '').trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
