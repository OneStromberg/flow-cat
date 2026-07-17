import { getGateway } from '../../../lib/sheets';
import { addWorker, type AddWorkerInput } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  const input: AddWorkerInput = {
    phone: str(b.phone),
    teudatZeut: str(b.teudatZeut),
    name: str(b.name),
    places: [],
    city: str(b.city),
    age: str(b.age),
    birthdate: str(b.birthdate),
    transportation: str(b.transportation),
    hebrewLevel: str(b.hebrewLevel),
    payType: '',
    payAmount: '',
    schedule: str(b.schedule),
    gender: str(b.gender),
    payStructure: '',
    payRate: '',
  };

  try {
    const r = await addWorker(getGateway(), input);
    if (!r.ok) return Response.json({ errors: r.errors }, { status: 400 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('register failed:', err);
    return Response.json({ error: 'registration failed' }, { status: 503 });
  }
}
