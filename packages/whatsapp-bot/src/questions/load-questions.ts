import { rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import type { Question, QuestionType } from './types.ts';

export async function loadQuestions(gateway: SheetsGateway): Promise<Question[]> {
  const rows = await gateway.readTab('Questions');
  const objs = rowsToObjects(rows);
  const qs: Question[] = objs
    .filter((o) => (o.key ?? '').trim() !== '')
    .map((o) => ({
      order: Number(o.order),
      key: o.key.trim(),
      type: (o.type ?? '').trim() as QuestionType,
      text: (o.text ?? '').trim(),
      options: (o.options ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      required: (o.required ?? '').trim().toLowerCase() !== 'no',
    }));
  return qs.sort((a, b) => {
    const ao = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
    return ao - bo;
  });
}
