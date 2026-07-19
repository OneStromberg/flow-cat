import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { requireManagerOrAdmin } from '../../../../lib/session';
import { getRequestGateway } from '../../../../lib/sheets';
import { findWorker, loadActivePlaces, CITIES, GENDER, TRANSPORTATION, HEBREW_LEVEL, PAY_TYPE, SCHEDULE, PAY_STRUCTURE } from '@scourage/worklog-core';
import { WorkerCard } from './worker-card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function WorkerPage({ params }: { params: Promise<{ phone: string }> }) {
  const admin = await requireManagerOrAdmin();
  if (!admin) redirect('/');
  const isAdmin = admin.role === 'admin';

  const { phone } = await params;
  const gw = getRequestGateway();
  const worker = await findWorker(gw, phone);
  if (!worker) notFound();

  const places = await loadActivePlaces(gw);
  const cities = CITIES.map((c) => c.value);

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-900 underline">
        ‹ Back to workers
      </Link>

      <div className="mt-6">
        <h1 className="text-2xl font-bold text-gray-900">{worker.name}</h1>
        <a href={`tel:${worker.phone}`} className="mt-1 block text-base text-blue-600 hover:underline">
          {worker.phone}
        </a>
        {worker.teudatZeut && <p className="mt-1 text-sm text-gray-600">ID: {worker.teudatZeut}</p>}
        {worker.city && <p className="mt-1 text-sm text-gray-600">{worker.city}</p>}
      </div>

      <WorkerCard
        worker={worker}
        places={places}
        cities={cities}
        enums={{
          gender: GENDER,
          transportation: TRANSPORTATION,
          hebrewLevel: HEBREW_LEVEL,
          payType: PAY_TYPE,
          schedule: SCHEDULE,
          payStructure: PAY_STRUCTURE,
        }}
        isAdmin={isAdmin}
      />
    </main>
  );
}
