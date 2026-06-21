import { rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import { normalizePhone } from './phone.ts';
import { loadActivePlaces } from './places.ts';

export interface Worker {
  phone: string;
  name: string;
  greeting: string;
  places: string[];
  active: boolean;
  token?: string;
  teudatZeut: string;
}

async function buildWorker(gateway: SheetsGateway, row: Record<string, string>): Promise<Worker> {
  const workerPlaces = (row.places ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const master = await loadActivePlaces(gateway);
  const masterLower = master.map((m) => m.toLowerCase());
  const places = master.length === 0
    ? workerPlaces
    : workerPlaces.filter((p) => {
        const ok = masterLower.includes(p.toLowerCase());
        if (!ok) console.warn(`Worker ${normalizePhone(row.phone ?? '')}: place "${p}" not in active Places master — skipped`);
        return ok;
      });
  return {
    phone: normalizePhone(row.phone ?? ''),
    name: (row.name ?? '').trim(),
    greeting: (row.greeting ?? '').trim(),
    places,
    active: (row.active ?? '').trim().toLowerCase() !== 'no',
    token: (row.token ?? '').trim(),
    teudatZeut: (row.teudat_zeut ?? '').trim(),
  };
}

export async function findWorker(gateway: SheetsGateway, phone: string): Promise<Worker | null> {
  const target = normalizePhone(phone);
  const objs = rowsToObjects(await gateway.readTab('Workers'));
  const row = objs.find((o) => normalizePhone(o.phone ?? '') === target);
  return row ? buildWorker(gateway, row) : null;
}

export async function findWorkerByToken(gateway: SheetsGateway, token: string): Promise<Worker | null> {
  const t = (token ?? '').trim();
  if (!t) return null;
  const objs = rowsToObjects(await gateway.readTab('Workers'));
  const row = objs.find((o) => (o.token ?? '').trim() === t);
  return row ? buildWorker(gateway, row) : null;
}

export async function authenticateWorker(
  gateway: SheetsGateway,
  phone: string,
  teudatZeut: string,
): Promise<Worker | null> {
  const worker = await findWorker(gateway, phone);
  if (!worker || !worker.active) return null;
  if (worker.teudatZeut === '' || worker.teudatZeut !== teudatZeut.trim()) return null;
  return worker;
}
