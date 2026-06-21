import type { SheetsGateway } from '@scourage/sheets-helper';
import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';
import { appendWorkLog } from '../data/worklogs.ts';
import { validateAnswers } from './validate-answers.ts';
import { buildWorklogRecord } from './build-record.ts';

export async function submitWorklog(
  gateway: SheetsGateway,
  worker: Worker,
  questions: Question[],
  answers: Record<string, string>,
  tz: string,
  now: Date,
): Promise<{ ok: true; hours: string | null } | { ok: false; errors: Record<string, string> }> {
  const v = validateAnswers(questions, answers, worker, tz, now);
  if (!v.ok) return v;
  const { record, keys } = buildWorklogRecord(worker, questions, answers, now);
  await appendWorkLog(gateway, record, keys);
  return { ok: true, hours: record['hours'] ?? null };
}
