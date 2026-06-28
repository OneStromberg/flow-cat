import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getRequestGateway } from '../../../lib/sheets';
import {
  listWorkers,
  loadActivePlaces,
  loadCities,
  GENDER,
  TRANSPORTATION,
  HEBREW_LEVEL,
  PAY_TYPE,
  SCHEDULE,
} from '@scourage/worklog-core';
import { BroadcastClient } from './broadcast-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function BroadcastPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  const gw = getRequestGateway();
  const [workers, activePlaces, cities] = await Promise.all([
    listWorkers(gw),
    loadActivePlaces(gw),
    loadCities(gw),
  ]);

  const places = [...new Set([...activePlaces, ...workers.flatMap((w) => w.places)])].sort();

  return (
    <main className="mx-auto max-w-2xl p-5">
      <h1 className="text-xl font-semibold">📣 Broadcast</h1>
      <BroadcastClient
        workers={workers}
        cities={cities}
        places={places}
        enums={{ gender: GENDER, transportation: TRANSPORTATION, hebrewLevel: HEBREW_LEVEL, payType: PAY_TYPE, schedule: SCHEDULE }}
      />
    </main>
  );
}
