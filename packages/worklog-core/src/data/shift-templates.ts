import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import { listRecurring, addRecurring } from './shift-assignments.ts';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface DayTime { day: string; start: string; end: string }

export interface ShiftTemplate {
  id: string; location: string; label: string; days: string[];
  start: string; end: string; headcount: number; validFrom: string; validTo: string; active: boolean;
  rate: string; instructions: string; dayTimes: DayTime[];
}
export interface AddTemplateInput {
  location: string; label: string; days: string[];
  start: string; end: string; headcount: string; validFrom: string; validTo: string;
  rate: string; instructions: string; dayTimes?: DayTime[];
}

const TEMPLATE_COLUMNS = ['id', 'location', 'label', 'days', 'start', 'end', 'headcount', 'valid_from', 'valid_to', 'active', 'rate', 'instructions', 'day_times'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const serializeDayTimes = (dts: DayTime[]) => dts.map((d) => `${d.day}=${d.start}-${d.end}`).join(';');

function parseDayTimes(s: string): DayTime[] {
  return s.split(';').map((seg) => {
    const eq = seg.indexOf('=');
    if (eq < 0) return null;
    const day = seg.slice(0, eq).trim();
    const times = seg.slice(eq + 1).trim();
    const dash = times.indexOf('-');
    if (dash < 0) return null;
    return { day, start: times.slice(0, dash), end: times.slice(dash + 1) };
  }).filter((x): x is DayTime => x !== null);
}

export function parseTemplate(o: Record<string, string>): ShiftTemplate {
  const rawDays = (o.days ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const start = (o.start ?? '').trim();
  const end = (o.end ?? '').trim();
  const rawDayTimes = (o.day_times ?? '').trim();
  const dayTimes = rawDayTimes ? parseDayTimes(rawDayTimes) : rawDays.map((day) => ({ day, start, end }));
  const days = dayTimes.map((d) => d.day);
  const effectiveStart = rawDayTimes ? (dayTimes[0]?.start ?? '') : start;
  const effectiveEnd = rawDayTimes ? (dayTimes[0]?.end ?? '') : end;
  return {
    id: (o.id ?? '').trim(),
    location: (o.location ?? '').trim(),
    label: (o.label ?? '').trim(),
    days,
    start: effectiveStart,
    end: effectiveEnd,
    headcount: Number((o.headcount ?? '0').trim()) || 0,
    validFrom: (o.valid_from ?? '').trim(),
    validTo: (o.valid_to ?? '').trim(),
    active: (o.active ?? '').trim().toLowerCase() !== 'no',
    rate: (o.rate ?? '').trim(),
    instructions: (o.instructions ?? '').trim(),
    dayTimes,
  };
}

export async function listTemplates(gateway: SheetsGateway): Promise<ShiftTemplate[]> {
  const objs = rowsToObjects(await gateway.readTab('ShiftTemplates'));
  return objs.filter((o) => (o.id ?? '').trim() !== '').map(parseTemplate);
}

function validate(input: AddTemplateInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!input.location.trim()) e.location = 'Required';
  if (input.dayTimes?.length) {
    const hasInvalid = input.dayTimes.some(
      (dt) => !(WEEKDAYS as readonly string[]).includes(dt.day) || !TIME_RE.test(dt.start) || !TIME_RE.test(dt.end) || dt.start === dt.end
    );
    if (hasInvalid) e.dayTimes = 'Each enabled day needs a valid start and end (HH:MM), and they must differ.';
  } else {
    if (input.days.length === 0 || !input.days.every((d) => (WEEKDAYS as readonly string[]).includes(d))) e.days = 'Pick at least one weekday';
    if (!TIME_RE.test(input.start)) e.start = 'Use HH:MM';
    if (!TIME_RE.test(input.end)) e.end = 'Use HH:MM';
    else if (input.start === input.end) e.end = "Start and end can't be the same";
  }
  const hc = Number(input.headcount);
  if (!Number.isInteger(hc) || hc < 1) e.headcount = 'Must be a positive whole number';
  if (input.validFrom && !DATE_RE.test(input.validFrom)) e.validFrom = 'Use YYYY-MM-DD';
  if (input.validTo && !DATE_RE.test(input.validTo)) e.validTo = 'Use YYYY-MM-DD';
  if (input.validFrom && input.validTo && input.validFrom > input.validTo) e.validTo = 'Must be on/after valid-from';
  return e;
}

function recordOf(id: string, input: AddTemplateInput): Record<string, string> {
  const effective: DayTime[] = input.dayTimes?.length
    ? input.dayTimes
    : input.days.map((d) => ({ day: d, start: input.start, end: input.end }));
  return {
    id, location: input.location.trim(), label: input.label.trim(),
    days: effective.map((d) => d.day).join(','),
    start: effective[0]?.start ?? '',
    end: effective[0]?.end ?? '',
    headcount: String(Number(input.headcount)),
    valid_from: input.validFrom.trim(), valid_to: input.validTo.trim(), active: 'yes',
    rate: (input.rate ?? '').trim(),
    instructions: (input.instructions ?? '').trim(),
    day_times: serializeDayTimes(effective),
  };
}

async function ensureHeader(gateway: SheetsGateway): Promise<string[]> {
  const rows = await gateway.readTab('ShiftTemplates');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];
  const header = [...existing];
  for (const c of TEMPLATE_COLUMNS) if (!header.includes(c)) header.push(c);
  if (existing.length === 0 || header.length !== existing.length) await gateway.writeHeaderRow('ShiftTemplates', header);
  return header;
}

export async function addTemplate(gateway: SheetsGateway, input: AddTemplateInput) {
  const errors = validate(input);
  if (Object.keys(errors).length) return { ok: false as const, errors };
  const id = 'tpl_' + crypto.randomUUID().slice(0, 8);
  const header = await ensureHeader(gateway);
  await gateway.appendRow('ShiftTemplates', objectToRow(recordOf(id, input), header));
  return { ok: true as const, id };
}

export async function copyTemplate(
  gateway: SheetsGateway,
  templateId: string,
  opts: { location?: string; validFrom?: string; validTo?: string; carryAssignments: boolean },
): Promise<{ ok: true; id: string } | { ok: false; errors: Record<string, string> }> {
  const templates = await listTemplates(gateway);
  const src = templates.find((t) => t.id === templateId);
  if (!src) return { ok: false, errors: { id: 'Not found' } };

  const result = await addTemplate(gateway, {
    location: opts.location ?? src.location,
    label: src.label,
    days: src.days,
    start: src.start,
    end: src.end,
    headcount: String(src.headcount),
    validFrom: opts.validFrom ?? src.validFrom,
    validTo: opts.validTo ?? src.validTo,
    rate: src.rate,
    instructions: src.instructions,
    dayTimes: src.dayTimes,
  });
  if (!result.ok) return result;

  const newId = result.id;

  if (opts.carryAssignments) {
    const recs = (await listRecurring(gateway, templateId)).filter((r) => r.active);
    for (const r of recs) {
      await addRecurring(gateway, newId, r.employeePhone);
    }
  }

  return { ok: true, id: newId };
}

export async function updateTemplate(gateway: SheetsGateway, id: string, input: AddTemplateInput) {
  const errors = validate(input);
  if (Object.keys(errors).length) return { ok: false as const, errors };
  const rows = await gateway.readTab('ShiftTemplates');
  const header = rows[0].map((h) => h.trim());
  const idx = rows.findIndex((r, i) => i > 0 && (r[header.indexOf('id')] ?? '').trim() === id);
  if (idx < 0) return { ok: false as const, errors: { id: 'Not found' } };
  const rec = { ...recordOf(id, input), active: (rows[idx][header.indexOf('active')] ?? 'yes') };
  await gateway.updateRow('ShiftTemplates', idx + 1, objectToRow(rec, header)); // updateRow is 1-based

  return { ok: true as const };
}

export async function deleteTemplate(gateway: SheetsGateway, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await gateway.readTab('ShiftTemplates');
  if (!rows.length) return { ok: false, error: 'Not found' };
  const header = rows[0].map((h) => h.trim());
  const idx = rows.findIndex((r, i) => i > 0 && (r[header.indexOf('id')] ?? '').trim() === id);
  if (idx < 0) return { ok: false, error: 'Not found' };
  const newRow = [...rows[idx]];
  newRow[header.indexOf('active')] = 'no';
  await gateway.updateRow('ShiftTemplates', idx + 1, newRow); // 1-based
  return { ok: true };
}
