import { getGateway } from '../../../../lib/sheets';
import { requireWorker } from '../../../../lib/session';
import { deactivatePushSubscription } from '@scourage/worklog-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export async function POST(req: Request) {
  const worker = await requireWorker();
  if (!worker || !worker.active) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const endpoint = str((body as Record<string, unknown> | null)?.endpoint);
  if (endpoint) {
    await deactivatePushSubscription(getGateway(), endpoint);
  }
  return Response.json({ ok: true });
}
