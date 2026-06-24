import { getGateway } from '../../../../lib/sheets';
import { requireAdmin } from '../../../../lib/session';
import { addAdjustment } from '@scourage/worklog-core';

export const runtime = 'nodejs';

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

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
  const input = {
    employeePhone: str(b.employeePhone),
    date: str(b.date),
    type: str(b.type),
    amount: str(b.amount),
    reason: str(b.reason),
    createdBy: admin.phone,
  };

  try {
    const result = await addAdjustment(getGateway(), input);
    if (!result.ok) {
      return Response.json({ errors: result.errors }, { status: 400 });
    }
    return Response.json({ ok: true, id: result.id });
  } catch (err) {
    console.error('addAdjustment failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
