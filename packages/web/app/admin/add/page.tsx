import { redirect } from 'next/navigation';
import { requireManagerOrAdmin } from '../../../lib/session';
import { getRequestGateway } from '../../../lib/sheets';
import { loadActivePlaces, CITIES, TRANSPORTATION, HEBREW_LEVEL, PAY_TYPE, SCHEDULE, GENDER, PAY_STRUCTURE } from '@scourage/worklog-core';
import { AddWorkerForm } from './add-worker-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AddWorkerPage() {
  const admin = await requireManagerOrAdmin();
  if (!admin) redirect('/');
  const isAdmin = admin.role === 'admin';
  const gw = getRequestGateway();
  const places = await loadActivePlaces(gw);
  return (
    <main className="mx-auto max-w-md p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Add worker</h1>
        <a href="/admin" className="text-sm text-gray-500 underline">Back</a>
      </div>
      <AddWorkerForm
        places={places}
        cities={CITIES}
        enums={{ transportation: TRANSPORTATION, hebrewLevel: HEBREW_LEVEL, payType: PAY_TYPE, schedule: SCHEDULE, gender: GENDER, payStructure: PAY_STRUCTURE }}
        isAdmin={isAdmin}
      />
    </main>
  );
}
