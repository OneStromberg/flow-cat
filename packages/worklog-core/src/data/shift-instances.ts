import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import { listTemplates } from './shift-templates.ts';
import { listRecurring } from './shift-assignments.ts';

export interface ShiftInstance {
  id: string;
  templateId: string;
  location: string;
  date: string;
  start: string;
  end: string;
  headcount: number;
  status: string;
}

const INSTANCE_COLUMNS = ['id', 'template_id', 'location', 'date', 'start', 'end', 'headcount', 'status', 'generated_at'];
const ASSIGN_COLUMNS = ['instance_id', 'employee_phone', 'source', 'status', 'assigned_at', 'assigned_by'];

// ── Date helpers ──────────────────────────────────────────────────────────────
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function compact(iso: string): string {
  return iso.replace(/-/g, '');
}

// ── Header helpers ────────────────────────────────────────────────────────────
async function ensureInstanceHeader(gateway: SheetsGateway): Promise<string[]> {
  const rows = await gateway.readTab('ShiftInstances');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];
  const header = [...existing];
  for (const c of INSTANCE_COLUMNS) if (!header.includes(c)) header.push(c);
  if (existing.length === 0 || header.length !== existing.length) {
    await gateway.writeHeaderRow('ShiftInstances', header);
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

// ── Public API ────────────────────────────────────────────────────────────────

export async function listInstances(
  gateway: SheetsGateway,
  filter: { from: string; to: string; location?: string },
): Promise<ShiftInstance[]> {
  const objs = rowsToObjects(await gateway.readTab('ShiftInstances'));
  return objs
    .filter((o) => (o.id ?? '').trim() !== '')
    .filter((o) => {
      const date = (o.date ?? '').trim();
      return date >= filter.from && date <= filter.to;
    })
    .filter((o) => !filter.location || (o.location ?? '').trim() === filter.location)
    .map((o) => ({
      id: (o.id ?? '').trim(),
      templateId: (o.template_id ?? '').trim(),
      location: (o.location ?? '').trim(),
      date: (o.date ?? '').trim(),
      start: (o.start ?? '').trim(),
      end: (o.end ?? '').trim(),
      headcount: Number((o.headcount ?? '0').trim()) || 0,
      status: (o.status ?? '').trim(),
    }));
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function updateInstance(
  gateway: SheetsGateway,
  id: string,
  fields: { date?: string; start?: string; end?: string; headcount?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await gateway.readTab('ShiftInstances');
  if (!rows.length) return { ok: false, error: 'Not found' };
  const header = rows[0].map((h) => h.trim());
  const i = rows.findIndex((r, idx) => idx > 0 && (r[header.indexOf('id')] ?? '').trim() === id);
  if (i < 0) return { ok: false, error: 'Not found' };

  if (fields.start !== undefined && !TIME_RE.test(fields.start)) return { ok: false, error: 'Invalid start time' };
  if (fields.end !== undefined && !TIME_RE.test(fields.end)) return { ok: false, error: 'Invalid end time' };
  if (fields.headcount !== undefined) {
    const hc = Number(fields.headcount);
    if (!Number.isInteger(hc) || hc < 1) return { ok: false, error: 'headcount must be a positive integer' };
  }

  const newRow = [...rows[i]];
  if (fields.date !== undefined) newRow[header.indexOf('date')] = fields.date;
  if (fields.start !== undefined) newRow[header.indexOf('start')] = fields.start;
  if (fields.end !== undefined) newRow[header.indexOf('end')] = fields.end;
  if (fields.headcount !== undefined) newRow[header.indexOf('headcount')] = fields.headcount;
  await gateway.updateRow('ShiftInstances', i + 1, newRow); // updateRow is 1-based
  return { ok: true };
}

export async function applyTemplateEdit(
  gateway: SheetsGateway,
  templateId: string,
  today: string,
): Promise<{ updated: number; cancelled: number }> {
  const templates = await listTemplates(gateway);
  const tpl = templates.find((t) => t.id === templateId);
  if (!tpl) return { updated: 0, cancelled: 0 };

  const rows = await gateway.readTab('ShiftInstances');
  if (!rows.length) return { updated: 0, cancelled: 0 };
  const header = rows[0].map((h) => h.trim());

  let updated = 0;
  let cancelled = 0;

  // Pre-build a map of templateId|date → Set<start> for all currently-scheduled instances.
  // Used in the single-slot branch to detect whether propagating a new start would collide
  // with a sibling instance that already owns that start (stale-leftover scenario).
  const scheduledStartsByKey = new Map<string, Set<string>>();
  for (let j = 1; j < rows.length; j++) {
    const r = rows[j];
    const rtid = (r[header.indexOf('template_id')] ?? '').trim();
    const rdate = (r[header.indexOf('date')] ?? '').trim();
    const rstart = (r[header.indexOf('start')] ?? '').trim();
    const rstatus = (r[header.indexOf('status')] ?? '').trim();
    if (rstatus === 'scheduled' && rtid && rdate && rstart) {
      const key = `${rtid}|${rdate}`;
      if (!scheduledStartsByKey.has(key)) scheduledStartsByKey.set(key, new Set());
      scheduledStartsByKey.get(key)!.add(rstart);
    }
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if ((row[header.indexOf('template_id')] ?? '').trim() !== templateId) continue;
    const date = (row[header.indexOf('date')] ?? '').trim();
    if (date < today) continue;
    if ((row[header.indexOf('status')] ?? '').trim() !== 'scheduled') continue;

    const wd = weekday(date);
    const daySlots = tpl.dayTimes.filter((d) => d.day === wd);
    const validFromOk = !tpl.validFrom || date >= tpl.validFrom;
    const validToOk = !tpl.validTo || date <= tpl.validTo;

    const newRow = [...row];

    if (!validFromOk || !validToOk || daySlots.length === 0) {
      // Date outside validity range or day removed from template → cancel
      newRow[header.indexOf('status')] = 'cancelled';
      cancelled++;
      await gateway.updateRow('ShiftInstances', i + 1, newRow); // updateRow is 1-based
    } else if (daySlots.length === 1) {
      // Single slot for this weekday: propagate all fields (start may change).
      // Guard: if propagating dt.start would collide with a sibling scheduled instance
      // that already owns that start, leave this (stale) instance completely untouched.
      // This is consistent with the multi-slot contract ("changed-start leaves a stale instance").
      const dt = daySlots[0];
      const instanceStart = (row[header.indexOf('start')] ?? '').trim();
      const wouldCollide =
        instanceStart !== dt.start &&
        (scheduledStartsByKey.get(`${templateId}|${date}`) ?? new Set<string>()).has(dt.start);
      if (!wouldCollide) {
        newRow[header.indexOf('location')] = tpl.location;
        newRow[header.indexOf('start')] = dt.start;
        newRow[header.indexOf('end')] = dt.end;
        newRow[header.indexOf('headcount')] = String(tpl.headcount);
        // status stays 'scheduled'
        updated++;
        await gateway.updateRow('ShiftInstances', i + 1, newRow); // updateRow is 1-based
      }
      // else: stale leftover — leave completely untouched (no update, no cancel)
    } else {
      // Multiple slots for this weekday: match by the instance's stored start time.
      // This avoids mis-assigning one slot's edits to the wrong instance.
      const instanceStart = (row[header.indexOf('start')] ?? '').trim();
      const dt = daySlots.find((s) => s.start === instanceStart);
      if (dt) {
        // Matched: update end and headcount; keep start (it is the identifier)
        newRow[header.indexOf('location')] = tpl.location;
        newRow[header.indexOf('end')] = dt.end;
        newRow[header.indexOf('headcount')] = String(tpl.headcount);
        // status stays 'scheduled'
        updated++;
        await gateway.updateRow('ShiftInstances', i + 1, newRow); // updateRow is 1-based
      }
      // No matching slot (slot removed or start changed): leave instance completely untouched
    }
  }

  return { updated, cancelled };
}

export async function cancelInstance(gateway: SheetsGateway, id: string): Promise<void> {
  const rows = await gateway.readTab('ShiftInstances');
  if (!rows.length) return;
  const header = rows[0].map((h) => h.trim());
  const idx = rows.findIndex((r, i) => i > 0 && (r[header.indexOf('id')] ?? '').trim() === id);
  if (idx < 0) return;
  const newRow = [...rows[idx]];
  newRow[header.indexOf('status')] = 'cancelled';
  await gateway.updateRow('ShiftInstances', idx + 1, newRow); // updateRow is 1-based
}

export async function generateInstances(
  gateway: SheetsGateway,
  today: string,
  horizonDays = 42,
): Promise<{ templatesProcessed: number; instancesCreated: number; assignmentsSeeded: number; horizonEnd: string }> {
  const horizonEnd = addDays(today, horizonDays);

  // Load all active templates
  const templates = (await listTemplates(gateway)).filter((t) => t.active);

  // Build composite idempotency map: template_id|date|start → existing row id
  // Also build a Set of all existing instance ids for stable-id dedup (handles admin-edited start/date).
  const instanceRows = rowsToObjects(await gateway.readTab('ShiftInstances'));
  const existingByComposite = new Map<string, string>();
  const existingIds = new Set<string>();
  for (const o of instanceRows) {
    const tid = (o.template_id ?? '').trim();
    const oDate = (o.date ?? '').trim();
    const oStart = (o.start ?? '').trim();
    const id = (o.id ?? '').trim();
    if (id) existingIds.add(id);
    if (tid && oDate && oStart && id) existingByComposite.set(`${tid}|${oDate}|${oStart}`, id);
  }

  // Load existing assignment keys (instanceId|phone, ANY status) into a Set (idempotency)
  const assignRows = rowsToObjects(await gateway.readTab('ShiftAssignments'));
  const existingAssignKeys = new Set(
    assignRows
      .map((o) => {
        const iid = (o.instance_id ?? '').trim();
        const ph = (o.employee_phone ?? '').trim();
        return iid && ph ? `${iid}|${ph}` : '';
      })
      .filter(Boolean),
  );

  // Ensure headers (read once, needed before appending)
  const instanceHeader = await ensureInstanceHeader(gateway);
  const assignHeader = await ensureAssignHeader(gateway);

  let instancesCreated = 0;
  let assignmentsSeeded = 0;

  for (const tpl of templates) {
    // Load active recurring assignments for this template
    const recurring = (await listRecurring(gateway, tpl.id)).filter((r) => r.active);

    for (let offset = 0; offset < horizonDays; offset++) {
      const date = addDays(today, offset);

      // Clip to valid_from / valid_to
      if (tpl.validFrom && date < tpl.validFrom) continue;
      if (tpl.validTo && date > tpl.validTo) continue;

      // Collect all slots for this weekday (supports multiple shifts on same day)
      const wd = weekday(date);
      const slots = tpl.dayTimes.filter((d) => d.day === wd);
      if (!slots.length) continue;

      for (const slot of slots) {
        const compositeKey = `${tpl.id}|${date}|${slot.start}`;
        const newId = `${tpl.id}_${compact(date)}_${slot.start.replace(':', '')}`;
        // Prefer composite lookup (recognises old-format ids and renamed starts).
        // Fall back to the stable new-format id (handles the case where an admin
        // edited start/date — the id is stable even when the mutable fields change).
        const compositeExistingId = existingByComposite.get(compositeKey);
        const instanceId = compositeExistingId ?? newId;
        const shouldCreate = !compositeExistingId && !existingIds.has(newId);

        // Create instance only when neither idempotency guard fires
        if (shouldCreate) {
          const record: Record<string, string> = {
            id: instanceId,
            template_id: tpl.id,
            location: tpl.location,
            date,
            start: slot.start,
            end: slot.end,
            headcount: String(tpl.headcount),
            status: 'scheduled',
            generated_at: new Date().toISOString(),
          };
          await gateway.appendRow('ShiftInstances', objectToRow(record, instanceHeader));
          existingByComposite.set(compositeKey, instanceId);
          existingIds.add(instanceId);
          instancesCreated++;
        }

        // Seed recurring assignments against the real instance id
        for (const rec of recurring) {
          const key = `${instanceId}|${rec.employeePhone}`;
          if (!existingAssignKeys.has(key)) {
            const assignRecord: Record<string, string> = {
              instance_id: instanceId,
              employee_phone: rec.employeePhone,
              source: 'recurring',
              status: 'assigned',
              assigned_at: new Date().toISOString(),
              assigned_by: 'system',
            };
            await gateway.appendRow('ShiftAssignments', objectToRow(assignRecord, assignHeader));
            existingAssignKeys.add(key);
            assignmentsSeeded++;
          }
        }
      }
    }
  }

  return {
    templatesProcessed: templates.length,
    instancesCreated,
    assignmentsSeeded,
    horizonEnd,
  };
}

export async function seedTemplateInstances(
  gateway: SheetsGateway,
  templateId: string,
  today: string,
  horizonDays = 42,
): Promise<{ instancesCreated: number; assignmentsSeeded: number }> {
  // Load only the one active template
  const tpl = (await listTemplates(gateway)).find((t) => t.id === templateId && t.active);
  if (!tpl) return { instancesCreated: 0, assignmentsSeeded: 0 };

  // Build composite idempotency map: template_id|date|start → existing row id
  // Also build a Set of all existing instance ids for stable-id dedup (handles admin-edited start/date).
  const instanceRows = rowsToObjects(await gateway.readTab('ShiftInstances'));
  const existingByComposite = new Map<string, string>();
  const existingIds = new Set<string>();
  for (const o of instanceRows) {
    const tid = (o.template_id ?? '').trim();
    const oDate = (o.date ?? '').trim();
    const oStart = (o.start ?? '').trim();
    const id = (o.id ?? '').trim();
    if (id) existingIds.add(id);
    if (tid && oDate && oStart && id) existingByComposite.set(`${tid}|${oDate}|${oStart}`, id);
  }

  // Load existing assignment keys (instanceId|phone, ANY status) into a Set (idempotency)
  const assignRows = rowsToObjects(await gateway.readTab('ShiftAssignments'));
  const existingAssignKeys = new Set(
    assignRows
      .map((o) => {
        const iid = (o.instance_id ?? '').trim();
        const ph = (o.employee_phone ?? '').trim();
        return iid && ph ? `${iid}|${ph}` : '';
      })
      .filter(Boolean),
  );

  // Ensure headers (read once, needed before appending)
  const instanceHeader = await ensureInstanceHeader(gateway);
  const assignHeader = await ensureAssignHeader(gateway);

  let instancesCreated = 0;
  let assignmentsSeeded = 0;

  // Load active recurring assignments for this template
  const recurring = (await listRecurring(gateway, tpl.id)).filter((r) => r.active);

  for (let offset = 0; offset < horizonDays; offset++) {
    const date = addDays(today, offset);

    // Clip to valid_from / valid_to
    if (tpl.validFrom && date < tpl.validFrom) continue;
    if (tpl.validTo && date > tpl.validTo) continue;

    // Collect all slots for this weekday (supports multiple shifts on same day)
    const wd = weekday(date);
    const slots = tpl.dayTimes.filter((d) => d.day === wd);
    if (!slots.length) continue;

    for (const slot of slots) {
      const compositeKey = `${tpl.id}|${date}|${slot.start}`;
      const newId = `${tpl.id}_${compact(date)}_${slot.start.replace(':', '')}`;
      // Prefer composite lookup (recognises old-format ids and renamed starts).
      // Fall back to the stable new-format id (handles admin-edited start/date).
      const compositeExistingId = existingByComposite.get(compositeKey);
      const instanceId = compositeExistingId ?? newId;
      const shouldCreate = !compositeExistingId && !existingIds.has(newId);

      // Create instance only when neither idempotency guard fires
      if (shouldCreate) {
        const record: Record<string, string> = {
          id: instanceId,
          template_id: tpl.id,
          location: tpl.location,
          date,
          start: slot.start,
          end: slot.end,
          headcount: String(tpl.headcount),
          status: 'scheduled',
          generated_at: new Date().toISOString(),
        };
        await gateway.appendRow('ShiftInstances', objectToRow(record, instanceHeader));
        existingByComposite.set(compositeKey, instanceId);
        existingIds.add(instanceId);
        instancesCreated++;
      }

      // Seed recurring assignments against the real instance id
      for (const rec of recurring) {
        const key = `${instanceId}|${rec.employeePhone}`;
        if (!existingAssignKeys.has(key)) {
          const assignRecord: Record<string, string> = {
            instance_id: instanceId,
            employee_phone: rec.employeePhone,
            source: 'recurring',
            status: 'assigned',
            assigned_at: new Date().toISOString(),
            assigned_by: 'system',
          };
          await gateway.appendRow('ShiftAssignments', objectToRow(assignRecord, assignHeader));
          existingAssignKeys.add(key);
          assignmentsSeeded++;
        }
      }
    }
  }

  return { instancesCreated, assignmentsSeeded };
}
