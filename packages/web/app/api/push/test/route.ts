import { getGateway } from '../../../../lib/sheets';
import { requireWorker } from '../../../../lib/session';
import { sendPushToPhone } from '../../../../lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const worker = await requireWorker();
  if (!worker || !worker.active) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const sent = await sendPushToPhone(getGateway(), worker.phone, {
    title: 'FlowCat',
    body: 'Test notification ✓',
    url: '/app',
  });
  return Response.json({ ok: true, sent });
}
