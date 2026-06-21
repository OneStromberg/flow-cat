import type { Question } from '../questions/types.ts';
import { parseClockTime, computeHours } from '../time/clock.ts';

export function buildWorklogRecord(
  worker: { phone: string; name: string },
  questions: Question[],
  answers: Record<string, string>,
  now: Date,
): { record: Record<string, string>; keys: string[] } {
  const record: Record<string, string> = {
    logged_at: now.toISOString(),
    phone: worker.phone,
    name: worker.name,
  };
  for (const qq of questions) record[qq.key] = answers[qq.key] ?? '';

  const startQ = questions.find((x) => x.key === 'start' && x.type === 'time');
  const endQ = questions.find((x) => x.key === 'end' && x.type === 'time');
  if (startQ && endQ && answers['start'] && answers['end']) {
    const s = parseClockTime(answers['start']);
    const e = parseClockTime(answers['end']);
    if (s && e) {
      const h = computeHours(s, e);
      if (h !== null) record['hours'] = String(h);
    }
  }
  return { record, keys: questions.map((x) => x.key) };
}
