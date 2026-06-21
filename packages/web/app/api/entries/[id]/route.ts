import { getGateway, COMPANY_TZ } from '../../../../lib/sheets';
import { requireWorker } from '../../../../lib/session';
import { loadQuestions, validateQuestions, updateEntry } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const worker = await requireWorker();
  if (!worker || !worker.active) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
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
    const r = await updateEntry(getGateway(), id, answers as Record<string, string>, worker, questions, COMPANY_TZ, new Date());
    if (r.ok) return Response.json({ ok: true });
    if ('errors' in r) return Response.json({ errors: r.errors }, { status: 400 });
    if (r.reason === 'locked' || r.reason === 'forbidden') return Response.json({ error: r.reason }, { status: 403 });
    return Response.json({ error: 'not found' }, { status: 404 });
  } catch (err) {
    console.error('edit failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
