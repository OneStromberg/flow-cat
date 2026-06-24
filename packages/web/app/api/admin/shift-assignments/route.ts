import { getGateway } from '../../../../lib/sheets';
import { requireAdmin } from '../../../../lib/session';
import { addRecurring, removeRecurring, generateInstances } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = await requireAdmin();
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
    // Non-blocking seeding: seed future instances; failure must not fail the request
    const today = new Date().toISOString().slice(0, 10);
    generateInstances(gw, today).catch((err) => {
      console.error('[shift-assignments] generateInstances failed (non-blocking):', err);
    });
    return Response.json({ ok: true });
  }

  if (action === 'removeRecurring') {
    await removeRecurring(gw, templateId, phone);
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
