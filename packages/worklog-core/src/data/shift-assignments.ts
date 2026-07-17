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

  // Check if a row exists for this (instance, phone) pair, ignoring status
  const existingIdx = rows.findIndex(
    (r, i) =>
      i > 0 &&
      (r[header.indexOf('instance_id')] ?? '').trim() === instanceId &&
      (r[header.indexOf('employee_phone')] ?? '').trim() === phone,
  );

  if (existingIdx >= 0) {
    // Row exists: reactivate if not already assigned
    const existingStatus = (rows[existingIdx][header.indexOf('status')] ?? '').trim();
    if (existingStatus !== 'assigned') {
      const newRow = [...rows[existingIdx]];
      newRow[header.indexOf('status')] = 'assigned';
      // Keep the existing assigned_at if it exists
      if (!newRow[header.indexOf('assigned_at')] || (newRow[header.indexOf('assigned_at')] ?? '').trim() === '') {
        newRow[header.indexOf('assigned_at')] = new Date().toISOString();
      }
      // Update rate if a non-empty rate is provided
      if ((rate ?? '').trim() !== '') {
        newRow[header.indexOf('rate')] = (rate ?? '').trim();
      }
      await gateway.updateRow('ShiftAssignments', existingIdx + 1, newRow);
    }
  } else {
    // Row doesn't exist: append new row
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

export async function repairDuplicateAssignments(
  gateway: SheetsGateway,
): Promise<{ collapsed: number }> {
  const header = await ensureAssignHeader(gateway);
  const rows = await gateway.readTab('ShiftAssignments');

  // Group row indices by (instance_id, employee_phone) where status === 'assigned'
  const groups = new Map<string, number[]>();
  for (let i = 1; i < rows.length; i++) {
    const status = (rows[i][header.indexOf('status')] ?? '').trim();
    if (status !== 'assigned') continue;

    const instanceId = (rows[i][header.indexOf('instance_id')] ?? '').trim();
    const employeePhone = (rows[i][header.indexOf('employee_phone')] ?? '').trim();
    if (!instanceId || !employeePhone) continue;

    const key = `${instanceId}|${employeePhone}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(i);
  }

  // For each group with >1 row, keep earliest assigned_at, mark rest as removed
  let collapsed = 0;
  for (const indices of groups.values()) {
    if (indices.length <= 1) continue;

    // Find the index with the earliest assigned_at
    let earliestIdx = indices[0];
    let earliestTime = Date.parse(rows[indices[0]][header.indexOf('assigned_at')] ?? '0');

    for (const idx of indices.slice(1)) {
      const time = Date.parse(rows[idx][header.indexOf('assigned_at')] ?? '0');
      if (time < earliestTime) {
        earliestTime = time;
        earliestIdx = idx;
      }
    }

    // Mark the rest as removed
    for (const idx of indices) {
      if (idx !== earliestIdx) {
        const newRow = [...rows[idx]];
        newRow[header.indexOf('status')] = 'removed';
        await gateway.updateRow('ShiftAssignments', idx + 1, newRow);
        collapsed++;
      }
    }
  }

  return { collapsed };
}
