import { getGateway } from '../../../../../lib/sheets';
import { requireManagerOrAdmin } from '../../../../../lib/session';
import { copyTemplate, generateInstances } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = await requireManagerOrAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  const templateId = str(b.templateId);
  const location = str(b.location);
  const carryAssignments = !!b.carryAssignments;

  try {
    const gw = getGateway();
    const r = await copyTemplate(gw, templateId, { location, carryAssignments });
    if (!r.ok) return Response.json({ errors: r.errors }, { status: 400 });
    const today = new Date().toISOString().slice(0, 10);
    let seedWarning = false;
    try {
      await generateInstances(gw, today);
    } catch (e) {
      seedWarning = true;
      console.error('[shifts/copy] generateInstances after save failed:', e);
    }
    return Response.json({ ok: true, id: r.id, seedWarning });
  } catch (err) {
    console.error('copy template failed:', err);
    return Response.json({ error: 'copy failed' }, { status: 503 });
  }
}
