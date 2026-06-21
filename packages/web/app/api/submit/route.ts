import { getGateway, COMPANY_TZ } from '../../../lib/sheets';
import { findWorkerByToken, loadQuestions, validateQuestions, submitWorklog } from '@scourage/worklog-core';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const { token, answers } = (body ?? {}) as { token?: unknown; answers?: unknown };
  if (typeof token !== 'string' || typeof answers !== 'object' || answers === null) {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }

  const gw = getGateway();
  const worker = await findWorkerByToken(gw, token);
  if (!worker || !worker.active) {
    return Response.json({ error: 'invalid link' }, { status: 404 });
  }

  const questions = await loadQuestions(gw);
  const valid = validateQuestions(questions);
  if (!valid.ok) {
    return Response.json({ error: 'not set up' }, { status: 503 });
  }

  try {
    const result = await submitWorklog(gw, worker, questions, answers as Record<string, string>, COMPANY_TZ, new Date());
    if (!result.ok) return Response.json({ errors: result.errors }, { status: 400 });
    return Response.json({ ok: true, hours: result.hours });
  } catch (err) {
    console.error('submit failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
