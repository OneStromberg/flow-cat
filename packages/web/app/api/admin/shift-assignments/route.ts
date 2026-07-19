import { getGateway } from '../../../../lib/sheets';
import { requireManagerOrAdmin } from '../../../../lib/session';
import { addRecurring, removeRecurring, seedTemplateInstances } from '@scourage/worklog-core';

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
  const action = typeof b.action === 'string' ? b.action : '';
  const templateId = typeof b.templateId === 'string' ? b.templateId.trim() : '';
  const phone = typeof b.phone === 'string' ? b.phone.trim() : '';

  if (!templateId || !phone) {
    return Response.json({ error: 'templateId and phone are required' }, { status: 400 });
  }

  const gw = getGateway();

  if (action === 'addRecurring') {
    await addRecurring(gw, templateId, phone);
    const today = new Date().toISOString().slice(0, 10);
    let seedWarning = false;
    try {
      await seedTemplateInstances(gw, templateId, today);
    } catch (e) {
      seedWarning = true;
      console.error('[shift-assignments] seed failed:', e);
    }
    return Response.json({ ok: true, seedWarning });
  }

  if (action === 'removeRecurring') {
    await removeRecurring(gw, templateId, phone);
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
