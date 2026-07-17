import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';

export interface RecurringAssignment {
  templateId: string;
  employeePhone: string;
  active: boolean;
}

export interface ShiftAssignment {
  instanceId: string;
  employeePhone: string;
  source: string;
  status: string;
  rate: string;
}

const RECURRING_COLUMNS = ['template_id', 'employee_phone', 'active', 'created_at'];
const ASSIGN_COLUMNS = ['instance_id', 'employee_phone', 'source', 'status', 'assigned_at', 'assigned_by', 'rate'];

async function ensureRecurringHeader(gateway: SheetsGateway): Promise<string[]> {
  const rows = await gateway.readTab('RecurringAssignments');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];
  const header = [...existing];
  for (const c of RECURRING_COLUMNS) if (!header.includes(c)) header.push(c);
  if (existing.length === 0 || header.length !== existing.length) {
    await gateway.writeHeaderRow('RecurringAssignments', header);
  }
  return header;
}

async function ensureAssignHeader(gateway: SheetsGateway): Promise<string[]> {
  const rows = await gateway.readTab('ShiftAssignments');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];
  const header = [...existing];
  for (const c of ASSIGN_COLUMNS) if (!header.includes(c)) header.push(c);
  if (existing.length === 0 || header.length !== existing.length) {
    await gateway.writeHeaderRow('ShiftAssignments', header);
  }
  return header;
}

export async function listRecurring(gateway: SheetsGateway, templateId?: string): Promise<RecurringAssignment[]> {
  const objs = rowsToObjects(await gateway.readTab('RecurringAssignments'));
  return objs
    .filter((o) => !templateId || (o.template_id ?? '').trim() === templateId)
    .map((o) => ({
      templateId: (o.template_id ?? '').trim(),
      employeePhone: (o.employee_phone ?? '').trim(),
      active: (o.active ?? '').trim().toLowerCase() !== 'no',
    }))
    .filter((r) => r.templateId && r.employeePhone);
}

export async function addRecurring(gateway: SheetsGateway, templateId: string, phone: string): Promise<void> {
  const header = await ensureRecurringHeader(gateway);
  const rows = await gateway.readTab('RecurringAssignments');

  // Check if row exists
  const idx = rows.findIndex(
    (r, i) =>
      i > 0 &&
      (r[header.indexOf('template_id')] ?? '').trim() === templateId &&
      (r[header.indexOf('employee_phone')] ?? '').trim() === phone,
  );

  if (idx >= 0) {
    // Row exists: set active=yes via updateRow (idx is 0-based, updateRow is 1-based)
    const newRow = [...rows[idx]];
    newRow[header.indexOf('active')] = 'yes';
    await gateway.updateRow('RecurringAssignments', idx + 1, newRow);
  } else {
    // Row doesn't exist: append new row
    const record: Record<string, string> = {
      template_id: templateId,
      employee_phone: phone,
      active: 'yes',
      created_at: new Date().toISOString(),
    };
    await gateway.appendRow('RecurringAssignments', objectToRow(record, header));
  }
}

export async function removeRecurring(gateway: SheetsGateway, templateId: string, phone: string): Promise<void> {
  const header = await ensureRecurringHeader(gateway);
  const rows = await gateway.readTab('RecurringAssignments');

  const idx = rows.findIndex(
    (r, i) =>
      i > 0 &&
      (r[header.indexOf('template_id')] ?? '').trim() === templateId &&
      (r[header.indexOf('employee_phone')] ?? '').trim() === phone,
  );

  if (idx >= 0) {
    const newRow = [...rows[idx]];
    newRow[header.indexOf('active')] = 'no';
    await gateway.updateRow('RecurringAssignments', idx + 1, newRow);
  }
}

export async function listAssignments(
  gateway: SheetsGateway,
  filter?: { instanceId?: string; employeePhone?: string },
): Promise<ShiftAssignment[]> {
  const objs = rowsToObjects(await gateway.readTab('ShiftAssignments'));
  return objs
    .filter((o) => (o.status ?? '').trim() === 'assigned')
    .filter((o) => !filter?.instanceId || (o.instance_id ?? '').trim() === filter.instanceId)
    .filter((o) => !filter?.employeePhone || (o.employee_phone ?? '').trim() === filter.employeePhone)
    .map((o) => ({
      instanceId: (o.instance_id ?? '').trim(),
      employeePhone: (o.employee_phone ?? '').trim(),
      source: (o.source ?? '').trim(),
      status: (o.status ?? '').trim(),
      rate: (o.rate ?? '').trim(),
    }))
    .filter((a) => a.instanceId && a.employeePhone);
}

export async function assignManual(
  gateway: SheetsGateway,
  instanceId: string,
  phone: string,
  assignedBy: string,
  rate = '',
): Promise<void> {
  const header = await ensureAssignHeader(gateway);
  const rows = await gateway.readTab('ShiftAssignments');

  // Check if an active (status=assigned) row exists for this (instance, phone) pair
  const existingIdx = rows.findIndex(
    (r, i) =>
      i > 0 &&
      (r[header.indexOf('instance_id')] ?? '').trim() === instanceId &&
      (r[header.indexOf('employee_phone')] ?? '').trim() === phone &&
      (r[header.indexOf('status')] ?? '').trim() === 'assigned',
  );

  // Only append if no active row exists
  if (existingIdx < 0) {
    const record: Record<string, string> = {
      instance_id: instanceId,
      employee_phone: phone,
      source: 'manual',
      status: 'assigned',
      assigned_at: new Date().toISOString(),
      assigned_by: assignedBy,
      rate: (rate ?? '').trim(),
    };
    await gateway.appendRow('ShiftAssignments', objectToRow(record, header));
  }
}

export async function removeAssignment(gateway: SheetsGateway, instanceId: string, phone: string): Promise<void> {
  const header = await ensureAssignHeader(gateway);
  const rows = await gateway.readTab('ShiftAssignments');

  const idx = rows.findIndex(
    (r, i) =>
      i > 0 &&
      (r[header.indexOf('instance_id')] ?? '').trim() === instanceId &&
      (r[header.indexOf('employee_phone')] ?? '').trim() === phone &&
      (r[header.indexOf('status')] ?? '').trim() === 'assigned',
  );

  if (idx >= 0) {
    const newRow = [...rows[idx]];
    newRow[header.indexOf('status')] = 'removed';
    await gateway.updateRow('ShiftAssignments', idx + 1, newRow);
  }
}
