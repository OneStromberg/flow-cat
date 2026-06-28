import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';

export const LEAVE_TYPES = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'sick', label: 'Sick' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'other', label: 'Other' },
] as const;

export interface Leave {
  id: string;
  employeePhone: string;
  type: string;
  from: string;
  to: string;
  status: string;
  reason: string;
}

const LEAVE_COLUMNS = ['id', 'employee_phone', 'type', 'from', 'to', 'status', 'reason', 'created_by', 'created_at'];

export async function listLeave(gateway: SheetsGateway, f: { employeePhone?: string; status?: string; from?: string; to?: string }): Promise<Leave[]> {
  const objs = rowsToObjects(await gateway.readTab('Leave'));
  return objs
    .filter((o) => (o.id ?? '').trim() !== '')
    .map((o) => ({
      id: (o.id ?? '').trim(),
      employeePhone: (o.employee_phone ?? '').trim(),
      type: (o.type ?? '').trim(),
      from: (o.from ?? '').trim(),
      to: (o.to ?? '').trim(),
      status: (o.status ?? '').trim(),
      reason: (o.reason ?? '').trim(),
    }))
    .filter(
      (l) =>
        (!f.employeePhone || l.employeePhone === f.employeePhone) &&
        (!f.status || l.status === f.status) &&
        (!f.from || !f.to || (l.from <= f.to && l.to >= f.from)),
    );
}

export async function addLeave(
  gateway: SheetsGateway,
  input: { employeePhone: string; type: string; from: string; to: string; reason: string; createdBy: string },
): Promise<{ ok: true; id: string } | { ok: false; errors: Record<string, string> }> {
  const errors: Record<string, string> = {};
  if (!input.employeePhone.trim()) errors.employeePhone = 'Required';
  const validTypes = ['vacation', 'sick', 'unpaid', 'other'];
  if (!validTypes.includes(input.type)) errors.type = 'Invalid';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from)) errors.from = 'Use YYYY-MM-DD';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.to)) errors.to = 'Use YYYY-MM-DD';
  if (input.from > input.to) errors.from = 'From date must be <= to date';
  if (Object.keys(errors).length) return { ok: false as const, errors };

  const id = 'lv_' + crypto.randomUUID().slice(0, 8);
  const record: Record<string, string> = {
    id,
    employee_phone: input.employeePhone.trim(),
    type: input.type,
    from: input.from,
    to: input.to,
    status: 'pending',
    reason: input.reason.trim(),
    created_by: input.createdBy,
    created_at: new Date().toISOString(),
  };
  const rows = await gateway.readTab('Leave');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];
  const header = [...existing];
  for (const c of LEAVE_COLUMNS) if (!header.includes(c)) header.push(c);
  if (existing.length === 0 || header.length !== existing.length) await gateway.writeHeaderRow('Leave', header);
  await gateway.appendRow('Leave', objectToRow(record, header));
  return { ok: true as const, id };
}

export async function setLeaveStatus(
  gateway: SheetsGateway,
  id: string,
  status: 'approved' | 'denied' | 'pending',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await gateway.readTab('Leave');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];

  const i = rows.findIndex((r, idx) => idx > 0 && (r[existing.indexOf('id')] ?? '').trim() === id);
  if (i < 0) return { ok: false as const, error: 'Not found' };

  const newRow = [...rows[i]];
  const statusIdx = existing.indexOf('status');
  newRow[statusIdx] = status;
  await gateway.updateRow('Leave', i + 1, newRow);
  return { ok: true as const };
}

export function isOnLeave(leaves: Leave[], phone: string, date: string): boolean {
  return leaves.some((l) => l.employeePhone === phone && l.status === 'approved' && l.from <= date && l.to >= date);
}
