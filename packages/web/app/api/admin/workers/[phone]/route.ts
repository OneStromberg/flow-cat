import { getGateway } from '../../../../../lib/sheets';
import { requireManagerOrAdmin } from '../../../../../lib/session';
import { updateWorker, findWorker, type UpdateWorkerInput } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ phone: string }> }) {
  const admin = await requireManagerOrAdmin();
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
  const gw = getGateway();

  // Only an admin caller may change a worker's role. A manager caller (also
  // gated in here since this route now allows requireManagerOrAdmin) has
  // their requested role silently ignored — the target's existing stored
  // role is preserved, so a manager can never grant admin/manager to
  // anyone (incl. themselves) via this form. Other field edits still apply.
  let role: string;
  if (admin.role === 'admin') {
    role = typeof b.role === 'string' ? b.role : 'worker';
  } else {
    const target = await findWorker(gw, phone);
    role = target?.role ?? 'worker';
  }

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
    role,
  };

  try {
    const r = await updateWorker(gw, phone, input);
    if (!r.ok) return Response.json({ errors: r.errors }, { status: 400 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('update worker failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
