import { redirect } from 'next/navigation';
import { requireWorker } from '../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Home() {
  const worker = await requireWorker();
  if (!worker) redirect('/login');
  redirect(worker.role === 'worker' ? '/app' : '/admin');
}
