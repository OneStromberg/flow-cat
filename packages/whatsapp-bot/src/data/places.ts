import { rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';

export async function loadActivePlaces(gateway: SheetsGateway): Promise<string[]> {
  const objs = rowsToObjects(await gateway.readTab('Places'));
  return objs
    .filter((o) => {
      const name = (o.place_name ?? '').trim();
      const active = (o.active ?? '').trim().toLowerCase();
      return name !== '' && active !== 'no';
    })
    .map((o) => (o.place_name ?? '').trim());
}
