import { getGateway } from '../../../../lib/sheets';
import { requireManagerOrAdmin } from '../../../../lib/session';
import { addTemplate, generateInstances, type AddTemplateInput } from '@scourage/worklog-core';

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
  const input: AddTemplateInput = {
    location: str(b.location),
    label: str(b.label),
    days: Array.isArray(b.days) ? (b.days as unknown[]).filter((x) => typeof x === 'string') as string[] : [],
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
    const r = await addTemplate(getGateway(), input);
    if (!r.ok) return Response.json({ errors: r.errors }, { status: 400 });
    const today = new Date().toISOString().slice(0, 10);
    let seedWarning = false;
    try {
      await generateInstances(getGateway(), today);
    } catch (e) {
      seedWarning = true;
      console.error('[shifts] generateInstances after save failed:', e);
    }
    return Response.json({ ok: true, id: r.id, seedWarning });
  } catch (err) {
    console.error('add template failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
