import { getGateway } from '../../../../../lib/sheets';
import { requireAdmin } from '../../../../../lib/session';
import { updateWorker, type UpdateWorkerInput } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ phone: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { phone } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const input: UpdateWorkerInput = {
    teudatZeut: str(b.teudatZeut),
    name: str(b.name),
    places: Array.isArray(b.places) ? (b.places as unknown[]).map(str).filter(Boolean) : [],
    city: str(b.city),
    age: str(b.age),
    birthdate: str(b.birthdate),
    transportation: str(b.transportation),
    hebrewLevel: str(b.hebrewLevel),
    payType: str(b.payType),
    payAmount: str(b.payAmount),
    schedule: str(b.schedule),
    gender: str(b.gender),
    payStructure: str(b.payStructure),
    payRate: str(b.payRate),
    active: Boolean(b.active),
    admin: Boolean(b.admin),
    role: str(b.role),
  };

  try {
    const r = await updateWorker(getGateway(), phone, input);
    if (!r.ok) return Response.json({ errors: r.errors }, { status: 400 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('update worker failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
