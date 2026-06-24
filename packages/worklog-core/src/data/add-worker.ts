import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import { normalizePhone } from './phone.ts';
import { TRANSPORTATION, HEBREW_LEVEL, PAY_TYPE, SCHEDULE, GENDER } from './worker-fields.ts';

export interface AddWorkerInput {
  phone: string;
  teudatZeut: string;
  name: string;
  places: string[];
  city: string;
  age: string;
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
  'admin', 'city', 'age', 'transportation', 'hebrew_level', 'pay_type', 'pay_amount', 'schedule', 'gender',
  'pay_structure', 'pay_rate', 'telegram_chat_id',
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
    age: input.age.trim(),
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
