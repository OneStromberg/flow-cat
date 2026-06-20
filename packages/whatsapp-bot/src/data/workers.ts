import { rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import { normalizePhone } from './phone.ts';
import { loadActivePlaces } from './places.ts';

export interface Worker {
  phone: string;
  name: string;
  greeting: string;
  places: string[];
  active: boolean;
}

export async function findWorker(
  gateway: SheetsGateway,
  phone: string,
): Promise<Worker | null> {
  const target = normalizePhone(phone);
  const objs = rowsToObjects(await gateway.readTab('Workers'));
  const row = objs.find((o) => normalizePhone(o.phone ?? '') === target);
  if (!row) return null;

  const workerPlaces = (row.places ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const masterPlaces = await loadActivePlaces(gateway);

  let resolvedPlaces: string[];
  if (masterPlaces.length === 0) {
    // Master list is empty (tab missing or empty) — keep worker places as-is.
    resolvedPlaces = workerPlaces;
  } else {
    const masterLower = masterPlaces.map((p) => p.toLowerCase());
    resolvedPlaces = [];
    for (const place of workerPlaces) {
      if (masterLower.includes(place.toLowerCase())) {
        resolvedPlaces.push(place);
      } else {
        console.warn(
          `Worker ${target}: place "${place}" not in active Places master — skipped`,
        );
      }
    }
  }

  return {
    phone: target,
    name: (row.name ?? '').trim(),
    greeting: (row.greeting ?? '').trim(),
    places: resolvedPlaces,
    active: (row.active ?? '').trim().toLowerCase() !== 'no',
  };
}
