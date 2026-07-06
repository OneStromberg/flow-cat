import { getGateway } from '../../../../../lib/sheets';
import { requireAdmin } from '../../../../../lib/session';
import {
  updateTemplate,
  applyTemplateEdit,
  generateInstances,
  type AddTemplateInput,
} from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const input: AddTemplateInput = {
    location: str(b.location),
    label: str(b.label),
    days: Array.isArray(b.days)
      ? (b.days as unknown[]).filter((x) => typeof x === 'string') as string[]
      : [],
    start: str(b.start),
    end: str(b.end),
    headcount: str(b.headcount),
    validFrom: str(b.validFrom),
    validTo: str(b.validTo),
    rate: str(b.rate),
    instructions: str(b.instructions),
    dayTimes: Array.isArray(b.dayTimes)
      ? (b.dayTimes as any[]).map((d) => ({ day: str(d?.day), start: str(d?.start), end: str(d?.end) })).filter((d) => d.day)
      : undefined,
  };

  try {
    const gw = getGateway();
    const r = await updateTemplate(gw, id, input);
    if (!r.ok) return Response.json({ errors: r.errors }, { status: 400 });
    const today = new Date().toISOString().slice(0, 10);
    await applyTemplateEdit(gw, id, today);
    let seedWarning = false;
    try {
      await generateInstances(gw, today);
    } catch (e) {
      seedWarning = true;
      console.error('[shifts/[id]] generateInstances after save failed:', e);
    }
    return Response.json({ ok: true, seedWarning });
  } catch (err) {
    console.error('update template failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
