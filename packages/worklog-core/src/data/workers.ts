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
  birthdate?: string;
  hebrewLevel?: string;
  payType?: string;
  payAmount?: string;
  schedule?: string;
  gender?: string;
  telegramChatId?: string;
  payStructure?: string;
  payRate?: string;
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
    birthdate: (row.birthdate ?? '').trim(),
    hebrewLevel: (row.hebrew_level ?? '').trim(),
    payType: (row.pay_type ?? '').trim(),
    payAmount: (row.pay_amount ?? '').trim(),
    schedule: (row.schedule ?? '').trim(),
    gender: (row.gender ?? '').trim(),
    telegramChatId: (row.telegram_chat_id ?? '').trim(),
    payStructure: (row.pay_structure ?? '').trim(),
    payRate: (row.pay_rate ?? '').trim(),
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

export interface BrokenWorker {
  token: string;
  name: string;
  phone: string;
  reason: 'blank' | 'duplicate';
}

/**
 * Returns workers whose phone is blank or shared with another worker.
 * These rows are invisible to `listWorkers` (blank-phone filter) and
 * cannot be looked up by phone (duplicate ambiguity). Use `setWorkerPhone`
 * (via the admin fix-phone endpoint) to repair them.
 */
export async function listBrokenWorkers(gateway: SheetsGateway): Promise<BrokenWorker[]> {
  const objs = rowsToObjects(await gateway.readTab('Workers'));

  // Count normalized phones for NON-blank rows to detect duplicates.
  const counts = new Map<string, number>();
  for (const o of objs) {
    const raw = (o.phone ?? '').trim();
    if (!raw) continue;
    const norm = normalizePhone(raw);
    counts.set(norm, (counts.get(norm) ?? 0) + 1);
  }

  const result: BrokenWorker[] = [];
  for (const o of objs) {
    const rawPhone = (o.phone ?? '').trim();
    const token = (o.token ?? '').trim();
    const name = (o.name ?? '').trim();
    if (!rawPhone) {
      result.push({ token, name, phone: rawPhone, reason: 'blank' });
    } else if ((counts.get(normalizePhone(rawPhone)) ?? 0) > 1) {
      result.push({ token, name, phone: rawPhone, reason: 'duplicate' });
    }
  }
  return result;
}

export async function findWorkerByChatId(gateway: SheetsGateway, chatId: string): Promise<Worker | null> {
  const target = String(chatId).trim();
  if (!target) return null;
  const objs = rowsToObjects(await gateway.readTab('Workers'));
  const row = objs.find((o) => {
    const id = (o.telegram_chat_id ?? '').trim();
    return id !== '' && id === target;
  });
  return row ? parseWorker(row, []) : null;
}

export async function linkTelegramChat(gateway: SheetsGateway, phone: string, chatId: string): Promise<boolean> {
  const target = normalizePhone(phone);
  const rows = await gateway.readTab('Workers');
  if (rows.length === 0) return false;
  const header = rows[0].map((h) => h.trim());
  let tgi = header.indexOf('telegram_chat_id');
  if (tgi < 0) { header.push('telegram_chat_id'); await gateway.writeHeaderRow('Workers', header); tgi = header.length - 1; }
  const phoneIdx = header.indexOf('phone');
  const i = rows.findIndex((r, idx) => idx > 0 && normalizePhone(r[phoneIdx] ?? '') === target);
  if (i < 0) return false;
  const row = [...rows[i]];
  while (row.length < header.length) row.push('');
  row[tgi] = chatId;
  await gateway.updateRow('Workers', i + 1, row);
  return true;
}
