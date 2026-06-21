import { objectToRow, type SheetsGateway } from '@scourage/sheets-helper';
import { normalizePhone } from '../data/phone.ts';
import type { Worker } from '../data/workers.ts';
import type { Question } from '../questions/types.ts';
import { validateAnswers } from '../submit/validate-answers.ts';
import { buildWorklogRecord } from '../submit/build-record.ts';

export interface WorkEntry {
  id: string;
  rowNumber: number; // 1-based sheet row
  phone: string;
  locked: boolean;
  hours: string;
  values: Record<string, string>;
}

function rowToObject(header: string[], row: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  header.forEach((h, i) => {
    if (h) o[h] = (row[i] ?? '').toString();
  });
  return o;
}

async function readEntries(gateway: SheetsGateway): Promise<{ header: string[]; entries: WorkEntry[] }> {
  const rows = await gateway.readTab('WorkLogs');
  if (rows.length === 0) return { header: [], entries: [] };
  const header = rows[0].map((h) => h.trim());
  const entries: WorkEntry[] = [];
  for (let k = 1; k < rows.length; k++) {
    const values = rowToObject(header, rows[k]);
    entries.push({
      id: (values.id ?? '').trim(),
      rowNumber: k + 1,
      phone: values.phone ?? '',
      locked: (values.locked ?? '').trim().toLowerCase() === 'yes',
      hours: values.hours ?? '',
      values,
    });
  }
  return { header, entries };
}

export async function listWorkerEntries(gateway: SheetsGateway, phone: string): Promise<WorkEntry[]> {
  const { entries } = await readEntries(gateway);
  const target = normalizePhone(phone);
  return entries.filter((e) => normalizePhone(e.phone) === target).reverse();
}

export async function getEntry(gateway: SheetsGateway, id: string): Promise<WorkEntry | null> {
  const t = (id ?? '').trim();
  if (!t) return null;
  const { entries } = await readEntries(gateway);
  return entries.find((e) => e.id === t) ?? null;
}

export async function updateEntry(
  gateway: SheetsGateway,
  id: string,
  answers: Record<string, string>,
  worker: Worker,
  questions: Question[],
  tz: string,
  now: Date,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'forbidden' | 'locked' } | { ok: false; errors: Record<string, string> }> {
  const { header, entries } = await readEntries(gateway);
  const entry = entries.find((e) => e.id === (id ?? '').trim());
  if (!entry) return { ok: false, reason: 'not_found' };
  if (normalizePhone(entry.phone) !== normalizePhone(worker.phone)) return { ok: false, reason: 'forbidden' };
  if (entry.locked) return { ok: false, reason: 'locked' };

  const v = validateAnswers(questions, answers, worker, tz, now);
  if (!v.ok) return { ok: false, errors: v.errors };

  const { record } = buildWorklogRecord(worker, questions, answers, now);
  // preserve original logged_at, id, and locked
  record.logged_at = entry.values.logged_at ?? record.logged_at;
  record.id = entry.id;
  record.locked = entry.values.locked ?? '';
  await gateway.updateRow('WorkLogs', entry.rowNumber, objectToRow(record, header));
  return { ok: true };
}
