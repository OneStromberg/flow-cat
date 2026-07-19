import { getGateway } from '../../../../lib/sheets';
import { requireManagerOrAdmin } from '../../../../lib/session';
import { adminCorrect } from '@scourage/worklog-core';

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
  const attendanceId = typeof b.attendanceId === 'string' ? b.attendanceId : '';
  const checkInAt = typeof b.checkInAt === 'string' ? b.checkInAt : undefined;
  const checkOutAt = typeof b.checkOutAt === 'string' ? b.checkOutAt : undefined;
  const hours = typeof b.hours === 'string' ? b.hours : undefined;

  if (!attendanceId) {
    return Response.json({ error: 'attendanceId required' }, { status: 400 });
  }

  try {
    const result = await adminCorrect(getGateway(), attendanceId, {
      checkInAt,
      checkOutAt,
      hours,
    });

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('admin correct failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
