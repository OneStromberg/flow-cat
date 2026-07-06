import { getGateway } from '../../../../../lib/sheets';
import { requireAdmin } from '../../../../../lib/session';
import { setWorkerPhone } from '@scourage/worklog-core';

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
  const token = typeof b.token === 'string' ? b.token : '';
  const phone = typeof b.phone === 'string' ? b.phone : '';

  if (!token) return Response.json({ error: 'token required' }, { status: 400 });

  const r = await setWorkerPhone(getGateway(), token, phone);
  if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  return Response.json({ ok: true });
}
