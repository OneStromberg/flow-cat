import { rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import { normalizePhone } from './phone.ts';

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
  return {
    phone: target,
    name: (row.name ?? '').trim(),
    greeting: (row.greeting ?? '').trim(),
    places: (row.places ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    active: (row.active ?? '').trim().toLowerCase() !== 'no',
  };
}
