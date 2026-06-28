import { redirect } from 'next/navigation';
import { requireWorker } from '../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AppPage() {
  const worker = await requireWorker();
  if (!worker || !worker.active) redirect('/login');
  redirect('/app/checkin');
}
