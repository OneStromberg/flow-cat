import { getGateway } from '../../../lib/sheets';
import { setSessionCookie } from '../../../lib/session';
import { authenticateWorker } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
  const { phone, teudatZeut } = (body ?? {}) as { phone?: unknown; teudatZeut?: unknown };
  if (typeof phone !== 'string' || typeof teudatZeut !== 'string') {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
  try {
    const worker = await authenticateWorker(getGateway(), phone, teudatZeut);
    if (!worker) {
      return Response.json({ error: "Phone number or teudat zeut didn't match." }, { status: 401 });
    }
    await setSessionCookie(worker.phone);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('login failed (sheets):', err);
    return Response.json({ error: 'Service unavailable, try again.' }, { status: 503 });
  }
}
