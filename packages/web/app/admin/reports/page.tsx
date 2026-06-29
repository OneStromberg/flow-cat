import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getGateway } from '../../../lib/sheets';
import { listPlaces, listWorkers } from '@scourage/worklog-core';
import { ReportsClient } from './reports-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  const gw = getGateway();
  const [places, workers] = await Promise.all([listPlaces(gw), listWorkers(gw)]);
  const locationNames = places.map((p) => p.name);
  const workerOptions = workers.map((w) => ({ phone: w.phone, name: w.name }));

  return (
    <main className="mx-auto max-w-4xl p-5">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Reports</h1>
      </div>
      <ReportsClient locationNames={locationNames} workerOptions={workerOptions} />
    </main>
  );
}
