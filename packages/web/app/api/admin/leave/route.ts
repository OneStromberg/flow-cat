import { getGateway } from '../../../../lib/sheets';
import { requireManagerOrAdmin } from '../../../../lib/session';
import { addLeave, setLeaveStatus } from '@scourage/worklog-core';

export const runtime = 'nodejs';

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

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
  const action = str(b.action);

  try {
    if (action === 'add') {
      const result = await addLeave(getGateway(), {
        employeePhone: str(b.employeePhone),
        type: str(b.type),
        from: str(b.from),
        to: str(b.to),
        reason: str(b.reason),
        createdBy: admin.phone,
      });
      if (!result.ok) {
        return Response.json({ errors: result.errors }, { status: 400 });
      }
      return Response.json({ ok: true, id: result.id });
    }

    if (action === 'setStatus') {
      const id = str(b.id);
      const status = str(b.status);
      if (!id) return Response.json({ error: 'id required' }, { status: 400 });
      if (!['approved', 'denied', 'pending'].includes(status)) {
        return Response.json({ error: 'status must be approved|denied|pending' }, { status: 400 });
      }
      const result = await setLeaveStatus(getGateway(), id, status as 'approved' | 'denied' | 'pending');
      if (!result.ok) {
        return Response.json({ error: result.error }, { status: 400 });
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    console.error('leave route failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
