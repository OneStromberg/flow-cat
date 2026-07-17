import { getGateway } from '../../../../../lib/sheets';
import { requireAdmin } from '../../../../../lib/session';
import {
  updateInstance,
  cancelInstance,
  assignManual,
  removeAssignment,
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
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

  const action = typeof b.action === 'string' ? b.action : '';

  try {
    const gw = getGateway();

    if (action === 'update') {
      const fields: { date?: string; start?: string; end?: string; headcount?: string } = {};
      const date = str(b.date);
      const start = str(b.start);
      const end = str(b.end);
      const headcount = str(b.headcount);
      if (date !== undefined) fields.date = date;
      if (start !== undefined) fields.start = start;
      if (end !== undefined) fields.end = end;
      if (headcount !== undefined) fields.headcount = headcount;
      const r = await updateInstance(gw, id, fields);
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      return Response.json({ ok: true });
    }

    if (action === 'cancel') {
      await cancelInstance(gw, id);
      return Response.json({ ok: true });
    }

    if (action === 'assign') {
      const phone = typeof b.phone === 'string' ? b.phone : '';
      await assignManual(gw, id, phone, admin.phone, typeof b.rate === 'string' ? b.rate : '');
      return Response.json({ ok: true });
    }

    if (action === 'remove') {
      const phone = typeof b.phone === 'string' ? b.phone : '';
      await removeAssignment(gw, id, phone);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'bad action' }, { status: 400 });
  } catch (err) {
    console.error('shift-instance action failed:', err);
    return Response.json({ error: 'action failed' }, { status: 503 });
  }
}
