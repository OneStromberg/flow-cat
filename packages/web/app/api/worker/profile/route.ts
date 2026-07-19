import { getGateway } from '../../../../lib/sheets';
import { requireWorker } from '../../../../lib/session';
import { loadProfileData } from '../../../../lib/data/worker-profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const worker = await requireWorker();
  if (!worker || !worker.active) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json(await loadProfileData(getGateway(), worker));
}
