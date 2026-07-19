import { redirect } from 'next/navigation';
import { requireManagerOrAdmin } from '../../lib/session';
import { getRequestGateway } from '../../lib/sheets';
import { listWorkers, listBrokenWorkers, loadActivePlaces, CITIES, TRANSPORTATION, HEBREW_LEVEL, PAY_TYPE, SCHEDULE, GENDER } from '@scourage/worklog-core';
import { WorkersFilter } from './workers-filter';
import { TelegramConnect } from '../components/telegram-connect';
import { BrokenWorkerFix } from './broken-worker-fix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const admin = await requireManagerOrAdmin();
  if (!admin) redirect('/');

  const gw = getRequestGateway();
  const [workers, brokenWorkers, activePlaces] = await Promise.all([
    listWorkers(gw),
    listBrokenWorkers(gw),
    loadActivePlaces(gw),
  ]);
  // Filter chips = master active places ∪ every place actually assigned in the sheet.
  const places = [...new Set([...activePlaces, ...workers.flatMap((w) => w.places)])].sort();

  return (
    <main className="mx-auto max-w-4xl p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Workers</h1>
        <div className="flex items-center gap-2">
          <TelegramConnect phone={admin.phone} linked={!!admin.telegramChatId} />
          <a href="/admin/add" className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white">+ Add worker</a>
        </div>
      </div>
      <BrokenWorkerFix workers={brokenWorkers} />
      <WorkersFilter
        workers={workers}
        cities={CITIES}
        places={places}
        enums={{ transportation: TRANSPORTATION, hebrewLevel: HEBREW_LEVEL, payType: PAY_TYPE, schedule: SCHEDULE, gender: GENDER }}
      />
    </main>
  );
}
