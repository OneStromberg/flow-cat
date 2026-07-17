import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';

export const PAY_STRUCTURE = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'fixed_shift', label: 'Fixed per shift' },
  { value: 'per_day', label: 'Per day' },
  { value: 'monthly', label: 'Monthly salary' },
  { value: 'piece', label: 'Piece (manual)' },
] as const;

export interface WorkedItem { date: string; hours: number; rate: number }
export interface Adjustment { id: string; employeePhone: string; date: string; type: string; amount: number; reason: string }
export interface PayBreakdown { gross: number; bonuses: number; penalties: number; net: number; basis: string }

const r2 = (n: number) => Math.round(n * 100) / 100;
function pos(s: string): number { const n = Number(s); return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : 0; }

export function resolveHourlyRate(employeeRate: string, templateRate: string, locationRate: string): number {
  return pos(employeeRate) || pos(templateRate) || pos(locationRate) || 0;
}

export function resolveAssignmentRate(
  assignmentRate: string, employeeRate: string, templateRate: string, locationRate: string,
): number {
  return pos(assignmentRate) || pos(employeeRate) || pos(templateRate) || pos(locationRate) || 0;
}

export function computePay(structure: string, payRate: number, items: WorkedItem[], adjustments: Adjustment[]): PayBreakdown {
  let gross = 0, basis = structure;
  if (structure === 'hourly') gross = items.reduce((s, i) => s + i.hours * i.rate, 0);
  else if (structure === 'fixed_shift') gross = items.length * payRate;
  else if (structure === 'per_day') gross = new Set(items.map((i) => i.date)).size * payRate;
  else if (structure === 'monthly') gross = payRate;
  else if (structure === 'piece') { gross = 0; basis = 'manual'; }
  const bonuses = adjustments.filter((a) => a.type === 'bonus').reduce((s, a) => s + a.amount, 0);
  const penalties = adjustments.filter((a) => a.type === 'penalty').reduce((s, a) => s + a.amount, 0);
  return { gross: r2(gross), bonuses: r2(bonuses), penalties: r2(penalties), net: r2(gross + bonuses - penalties), basis };
}

const ADJ_COLUMNS = ['id', 'employee_phone', 'date', 'type', 'amount', 'reason', 'created_by', 'created_at'];

export async function listAdjustments(gateway: SheetsGateway, f: { employeePhone?: string; from?: string; to?: string }): Promise<Adjustment[]> {
  const objs = rowsToObjects(await gateway.readTab('Adjustments'));
  return objs
    .filter((o) => (o.id ?? '').trim() !== '')
    .map((o) => ({ id:(o.id??'').trim(), employeePhone:(o.employee_phone??'').trim(), date:(o.date??'').trim(), type:(o.type??'').trim(), amount:Number((o.amount??'0').trim())||0, reason:(o.reason??'').trim() }))
    .filter((a) => (!f.employeePhone || a.employeePhone === f.employeePhone) && (!f.from || a.date >= f.from) && (!f.to || a.date <= f.to));
}

export async function addAdjustment(gateway: SheetsGateway, input: { employeePhone: string; date: string; type: string; amount: string; reason: string; createdBy: string }) {
  const errors: Record<string, string> = {};
  if (!input.employeePhone.trim()) errors.employeePhone = 'Required';
  if (!input.reason.trim()) errors.reason = 'Required';
  if (input.type !== 'bonus' && input.type !== 'penalty') errors.type = 'Invalid';
  if (!(Number(input.amount) > 0)) errors.amount = 'Must be a positive number';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = 'Use YYYY-MM-DD';
  if (Object.keys(errors).length) return { ok: false as const, errors };
  const id = 'adj_' + crypto.randomUUID().slice(0, 8);
  const record: Record<string, string> = { id, employee_phone: input.employeePhone.trim(), date: input.date, type: input.type, amount: String(Number(input.amount)), reason: input.reason.trim(), created_by: input.createdBy, created_at: new Date().toISOString() };
  const rows = await gateway.readTab('Adjustments');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];
  const header = [...existing];
  for (const c of ADJ_COLUMNS) if (!header.includes(c)) header.push(c);
  if (existing.length === 0 || header.length !== existing.length) await gateway.writeHeaderRow('Adjustments', header);
  await gateway.appendRow('Adjustments', objectToRow(record, header));
  return { ok: true as const, id };
}
