import { getGateway } from '../../../../lib/sheets';
import { requireWorker } from '../../../../lib/session';
import { savePushSubscription, type PushSub } from '@scourage/worklog-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function parseSubscription(body: unknown): PushSub | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const endpoint = str(b.endpoint);
  const keysRaw = (b.keys ?? {}) as Record<string, unknown>;
  const p256dh = str(keysRaw.p256dh);
  const auth = str(keysRaw.auth);
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export async function POST(req: Request) {
  const worker = await requireWorker();
  if (!worker || !worker.active) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid subscription' }, { status: 400 });
  }

  const sub = parseSubscription(body);
  if (!sub) return Response.json({ error: 'invalid subscription' }, { status: 400 });

  await savePushSubscription(getGateway(), worker.phone, sub, req.headers.get('user-agent') ?? '');
  return Response.json({ ok: true });
}
