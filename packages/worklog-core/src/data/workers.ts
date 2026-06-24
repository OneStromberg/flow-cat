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
  admin?: boolean;
  city?: string;
  transportation?: string;
  age?: string;
  hebrewLevel?: string;
  payType?: string;
  payAmount?: string;
  schedule?: string;
  gender?: string;
}

/** Pure: build a Worker from a sheet row, filtering places against a pre-loaded master list. */
export function parseWorker(row: Record<string, string>, master: string[]): Worker {
  const workerPlaces = (row.places ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const masterLower = master.map((m) => m.toLowerCase());
  const places = master.length === 0
    ? workerPlaces
    : workerPlaces.filter((p) => masterLower.includes(p.toLowerCase()));
  return {
    phone: normalizePhone(row.phone ?? ''),
    name: (row.name ?? '').trim(),
    greeting: (row.greeting ?? '').trim(),
    places,
    active: (row.active ?? '').trim().toLowerCase() !== 'no',
    token: (row.token ?? '').trim(),
    teudatZeut: (row.teudat_zeut ?? '').trim(),
    admin: (row.admin ?? '').trim().toLowerCase() === 'yes',
    city: (row.city ?? '').trim(),
    transportation: (row.transportation ?? '').trim(),
    age: (row.age ?? '').trim(),
    hebrewLevel: (row.hebrew_level ?? '').trim(),
    payType: (row.pay_type ?? '').trim(),
    payAmount: (row.pay_amount ?? '').trim(),
    schedule: (row.schedule ?? '').trim(),
    gender: (row.gender ?? '').trim(),
  };
}

async function buildWorker(gateway: SheetsGateway, row: Record<string, string>): Promise<Worker> {
  const master = await loadActivePlaces(gateway);
  return parseWorker(row, master);
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

/**
 * Lists all workers for admin/management views with their RAW sheet places (no
 * master-Places filtering — `parseWorker(o, [])` keeps every assigned place).
 * The worker-facing `findWorker` still filters places against the master list.
 */
export async function listWorkers(gateway: SheetsGateway): Promise<Worker[]> {
  const objs = rowsToObjects(await gateway.readTab('Workers'));
  return objs.filter((o) => (o.phone ?? '').trim() !== '').map((o) => parseWorker(o, []));
}
