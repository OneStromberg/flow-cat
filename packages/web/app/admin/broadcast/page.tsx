import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getRequestGateway, COMPANY_TZ } from '../../../lib/sheets';
import {
  listWorkers,
  loadActivePlaces,
  loadCities,
  listInstances,
  todayISO,
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
  const [workers, activePlaces, cities, rawInstances] = await Promise.all([
    listWorkers(gw),
    loadActivePlaces(gw),
    loadCities(gw),
    listInstances(gw, { from: todayISO(COMPANY_TZ), to: '2099-12-31' }),
  ]);

  const places = [...new Set([...activePlaces, ...workers.flatMap((w) => w.places)])].sort();

  const shifts = rawInstances
    .filter((i) => i.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .slice(0, 100)
    .map(({ id, location, date, start, end, headcount }) => ({ id, location, date, start, end, headcount }));

  return (
    <main className="mx-auto max-w-2xl p-5">
      <h1 className="text-xl font-semibold">📣 Broadcast</h1>
      <BroadcastClient
        workers={workers}
        cities={cities}
        places={places}
        shifts={shifts}
        enums={{ gender: GENDER, transportation: TRANSPORTATION, hebrewLevel: HEBREW_LEVEL, payType: PAY_TYPE, schedule: SCHEDULE }}
      />
    </main>
  );
}
