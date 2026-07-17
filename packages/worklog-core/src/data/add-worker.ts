import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import { normalizePhone } from './phone.ts';
import { TRANSPORTATION, HEBREW_LEVEL, PAY_TYPE, SCHEDULE, GENDER } from './worker-fields.ts';

export function ageFromBirthdate(birthdate: string, now: Date = new Date()): number | null {
  const s = (birthdate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return null;
  if (d.getTime() > now.getTime()) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

export interface AddWorkerInput {
  phone: string;
  teudatZeut: string;
  name: string;
  places: string[];
  city: string;
  age: string;
  birthdate: string;
  transportation: string;
  hebrewLevel: string;
  payType: string;
  payAmount: string;
  schedule: string;
  gender: string;
  payStructure: string;
  payRate: string;
}

const WORKERS_COLUMNS = [
  'phone', 'name', 'greeting', 'places', 'active', 'token', 'teudat_zeut',
  'admin', 'city', 'age', 'birthdate', 'transportation', 'hebrew_level', 'pay_type', 'pay_amount', 'schedule', 'gender',
  'pay_structure', 'pay_rate', 'telegram_chat_id', 'lang',
];

function inEnum(val: string, list: readonly { value: string }[]): boolean {
  return val === '' || list.some((o) => o.value === val);
}

export async function addWorker(
  gateway: SheetsGateway,
  input: AddWorkerInput,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  const errors: Record<string, string> = {};
  const phone = normalizePhone(input.phone);

  if (!phone) errors.phone = 'Required';
  if (!input.teudatZeut.trim()) errors.teudatZeut = 'Required';
  if (!input.name.trim()) errors.name = 'Required';
  if (input.age.trim() && !Number.isFinite(Number(input.age))) errors.age = 'Must be a number';
  if (!inEnum(input.transportation, TRANSPORTATION)) errors.transportation = 'Invalid';
  if (!inEnum(input.hebrewLevel, HEBREW_LEVEL)) errors.hebrewLevel = 'Invalid';
  if (!inEnum(input.payType, PAY_TYPE)) errors.payType = 'Invalid';
  if (!inEnum(input.schedule, SCHEDULE)) errors.schedule = 'Invalid';
  if (!inEnum(input.gender, GENDER)) errors.gender = 'Invalid';
  if (input.payType === 'amount' && (!input.payAmount.trim() || !Number.isFinite(Number(input.payAmount)))) {
    errors.payAmount = 'Enter an amount';
  }

  if (phone && !errors.phone) {
    const objs = rowsToObjects(await gateway.readTab('Workers'));
    if (objs.some((o) => normalizePhone(o.phone ?? '') === phone)) {
      errors.phone = 'A worker with this phone already exists';
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const birthdateTrimmed = input.birthdate.trim();
  const age = birthdateTrimmed
    ? String(ageFromBirthdate(birthdateTrimmed) ?? '')
    : input.age.trim();

  const record: Record<string, string> = {
    phone,
    name: input.name.trim(),
    greeting: '',
    places: input.places.join(', '),
    active: 'yes',
    token: '',
    teudat_zeut: input.teudatZeut.trim(),
    admin: '',
    city: input.city.trim(),
    age,
    birthdate: birthdateTrimmed,
    transportation: input.transportation,
    hebrew_level: input.hebrewLevel,
    pay_type: input.payType,
    pay_amount: input.payType === 'amount' ? input.payAmount.trim() : '',
    schedule: input.schedule,
    gender: input.gender,
    pay_structure: (input.payStructure ?? '').trim(),
    pay_rate: (input.payRate ?? '').trim(),
  };

  const rows = await gateway.readTab('Workers');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];
  const header = [...existing];
  for (const col of WORKERS_COLUMNS) if (!header.includes(col)) header.push(col);
  if (existing.length === 0 || header.length !== existing.length) {
    await gateway.writeHeaderRow('Workers', header);
  }
  await gateway.appendRow('Workers', objectToRow(record, header));
  return { ok: true };
}

export interface UpdateWorkerInput {
  teudatZeut: string;
  name: string;
  places: string[];
  city: string;
  age: string;
  birthdate: string;
  transportation: string;
  hebrewLevel: string;
  payType: string;
  payAmount: string;
  schedule: string;
  gender: string;
  payStructure: string;
  payRate: string;
  active: boolean;
  admin: boolean;
}

export async function setWorkerPhone(
  gateway: SheetsGateway,
  token: string,
  newPhone: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await gateway.readTab('Workers');
  const header = rows[0].map((h) => h.trim());
  const tokenCol = header.indexOf('token');
  const phoneCol = header.indexOf('phone');

  const idx = rows.findIndex((r, i) => i > 0 && (r[tokenCol] ?? '').trim() === token);
  if (idx < 0) return { ok: false, error: 'Worker not found' };

  const p = normalizePhone(newPhone);
  if (!p) return { ok: false, error: 'Phone required' };

  if (rows.some((r, j) => j > 0 && j !== idx && normalizePhone(r[phoneCol] ?? '') === p)) {
    return { ok: false, error: 'A worker with this phone already exists' };
  }

  const newRow = [...rows[idx]];
  while (newRow.length < header.length) newRow.push('');
  newRow[phoneCol] = p;
  await gateway.updateRow('Workers', idx + 1, newRow);
  return { ok: true };
}

/**
 * Persists a worker's preferred UI language (`ru` | `en` | `he`) by phone.
 * Callers should pass an already-resolved `Lang` (see `resolveLang` in
 * `packages/web/lib/i18n/strings.ts`) so only valid locale codes land in the sheet.
 */
export async function setWorkerLang(gateway: SheetsGateway, phone: string, lang: string): Promise<void> {
  const target = normalizePhone(phone);
  const rows = await gateway.readTab('Workers');
  if (rows.length === 0) return;

  let header = rows[0].map((h) => h.trim());
  if (!header.includes('lang')) {
    header = [...header, 'lang'];
    await gateway.writeHeaderRow('Workers', header);
  }

  const phoneIdx = header.indexOf('phone');
  const langIdx = header.indexOf('lang');
  const i = rows.findIndex((r, idx) => idx > 0 && normalizePhone(r[phoneIdx] ?? '') === target);
  if (i < 0) return;

  const row = [...rows[i]];
  while (row.length < header.length) row.push('');
  row[langIdx] = lang;
  await gateway.updateRow('Workers', i + 1, row);
}

export async function updateWorker(
  gateway: SheetsGateway,
  phone: string,
  input: UpdateWorkerInput,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  // Find the row first — not-found is returned before any field validation.
  const rows = await gateway.readTab('Workers');
  const header = rows[0].map((h) => h.trim());
  const target = normalizePhone(phone);
  const phoneIdx = header.indexOf('phone');
  const i = rows.findIndex((r, idx) => idx > 0 && normalizePhone(r[phoneIdx] ?? '') === target);
  if (i < 0) return { ok: false, errors: { phone: 'Not found' } };

  const errors: Record<string, string> = {};

  if (!input.teudatZeut.trim()) errors.teudatZeut = 'Required';
  if (!input.name.trim()) errors.name = 'Required';
  if (input.age.trim() && !Number.isFinite(Number(input.age))) errors.age = 'Must be a number';
  if (!inEnum(input.transportation, TRANSPORTATION)) errors.transportation = 'Invalid';
  if (!inEnum(input.hebrewLevel, HEBREW_LEVEL)) errors.hebrewLevel = 'Invalid';
  if (!inEnum(input.payType, PAY_TYPE)) errors.payType = 'Invalid';
  if (!inEnum(input.schedule, SCHEDULE)) errors.schedule = 'Invalid';
  if (!inEnum(input.gender, GENDER)) errors.gender = 'Invalid';
  if (input.payType === 'amount' && (!input.payAmount.trim() || !Number.isFinite(Number(input.payAmount)))) {
    errors.payAmount = 'Enter an amount';
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const existing = rows[i];
  const get = (col: string) => existing[header.indexOf(col)] ?? '';

  const fullHeader = [...header];
  for (const col of WORKERS_COLUMNS) if (!fullHeader.includes(col)) fullHeader.push(col);
  if (fullHeader.length !== header.length) {
    await gateway.writeHeaderRow('Workers', fullHeader);
  }

  const birthdateTrimmed = input.birthdate.trim();
  const ageTrimmed = input.age.trim();
  const age = birthdateTrimmed
    ? String(ageFromBirthdate(birthdateTrimmed) ?? '')
    : (ageTrimmed || get('age'));

  const record: Record<string, string> = {
    phone: target,
    name: input.name.trim(),
    greeting: get('greeting'),
    places: input.places.join(', '),
    active: input.active ? 'yes' : 'no',
    token: get('token'),
    teudat_zeut: input.teudatZeut.trim(),
    admin: input.admin ? 'yes' : '',
    city: input.city.trim(),
    age,
    birthdate: birthdateTrimmed,
    transportation: input.transportation,
    hebrew_level: input.hebrewLevel,
    pay_type: input.payType,
    pay_amount: input.payType === 'amount' ? input.payAmount.trim() : '',
    schedule: input.schedule,
    gender: input.gender,
    pay_structure: (input.payStructure ?? '').trim(),
    pay_rate: (input.payRate ?? '').trim(),
    telegram_chat_id: get('telegram_chat_id'),
  };

  await gateway.updateRow('Workers', i + 1, objectToRow(record, fullHeader));
  return { ok: true };
}
