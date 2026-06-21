import { getGateway, COMPANY_TZ } from '../../../lib/sheets';
import { requireWorker } from '../../../lib/session';
import { loadQuestions, validateQuestions, submitWorklog } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const worker = await requireWorker();
  if (!worker || !worker.active) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const { answers } = (body ?? {}) as { answers?: unknown };
  if (typeof answers !== 'object' || answers === null) {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }

  try {
    const questions = await loadQuestions(getGateway());
    const valid = validateQuestions(questions);
    if (!valid.ok) return Response.json({ error: 'not set up' }, { status: 503 });
    const result = await submitWorklog(getGateway(), worker, questions, answers as Record<string, string>, COMPANY_TZ, new Date());
    if (!result.ok) return Response.json({ errors: result.errors }, { status: 400 });
    return Response.json({ ok: true, hours: result.hours });
  } catch (err) {
    console.error('submit failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
