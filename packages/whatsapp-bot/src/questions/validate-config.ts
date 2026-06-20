import type { Question, QuestionType } from './types.ts';

const TYPES: ReadonlySet<QuestionType> = new Set([
  'worker_places', 'date', 'time', 'choice', 'text', 'number',
]);

export function validateQuestions(
  qs: Question[],
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (qs.length === 0) errors.push('No questions defined.');

  const seen = new Set<string>();
  for (const q of qs) {
    if (seen.has(q.key)) errors.push(`Duplicate key: ${q.key}`);
    seen.add(q.key);
    if (!TYPES.has(q.type)) errors.push(`Unknown type "${q.type}" for key ${q.key}`);
    if (q.type === 'choice' && q.options.length === 0) {
      errors.push(`choice "${q.key}" has no options`);
    }
    if (!q.text) errors.push(`Question ${q.key} has no text`);
  }

  const placeCount = qs.filter((q) => q.type === 'worker_places').length;
  if (placeCount !== 1) {
    errors.push(`Expected exactly one worker_places question, found ${placeCount}.`);
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
