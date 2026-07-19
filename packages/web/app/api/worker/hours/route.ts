import { getGateway } from '../../../../lib/sheets';
import { requireWorker } from '../../../../lib/session';
import { loadHoursData } from '../../../../lib/data/worker-hours';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const worker = await requireWorker();
  if (!worker || !worker.active) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json(await loadHoursData(getGateway(), worker));
}
