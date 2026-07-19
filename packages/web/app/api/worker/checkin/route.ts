import { getGateway } from '../../../../lib/sheets';
import { requireWorker } from '../../../../lib/session';
import { loadCheckinData } from '../../../../lib/data/worker-checkin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const worker = await requireWorker();
  if (!worker || !worker.active) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json(await loadCheckinData(getGateway(), worker));
}
