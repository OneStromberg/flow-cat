import type { Question } from '../questions/types.ts';
import type { Worker } from '../data/workers.ts';
import { parseClockTime } from '../time/clock.ts';
import { todayISO } from '../time/dates.ts';

export function validateAnswers(
  questions: Question[],
  answers: Record<string, string>,
  worker: Worker,
  tz: string,
  now: Date,
): { ok: true } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  for (const q of questions) {
    const raw = (answers[q.key] ?? '').trim();
    if (raw === '') {
      if (q.required) errors[q.key] = 'Required';
      continue;
    }
    switch (q.type) {
      case 'worker_places':
        if (!worker.places.some((p) => p.toLowerCase() === raw.toLowerCase())) errors[q.key] = 'Not one of your sites';
        break;
      case 'choice':
        if (!q.options.some((o) => o.toLowerCase() === raw.toLowerCase())) errors[q.key] = 'Not a valid option';
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) errors[q.key] = 'Invalid date';
        else if (raw > todayISO(tz, now)) errors[q.key] = 'Date is in the future';
        break;
      case 'time':
        if (!parseClockTime(raw)) errors[q.key] = 'Invalid time (HH:MM)';
        break;
      case 'number':
        if (!Number.isFinite(Number(raw))) errors[q.key] = 'Must be a number';
        break;
      // text: any non-empty value is valid
    }
  }

  // cross-field: identical start/finish is invalid; start > end is a valid overnight shift
  const s = parseClockTime(answers['start'] ?? '');
  const e = parseClockTime(answers['end'] ?? '');
  if (s && e && s.h === e.h && s.m === e.m) errors['end'] = "Start and finish can't be the same time.";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}
