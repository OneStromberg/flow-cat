import { redirect } from 'next/navigation';
import { requireAdmin } from '../../lib/session';
import { getRequestGateway } from '../../lib/sheets';
import { listWorkers, loadActivePlaces, TRANSPORTATION, HEBREW_LEVEL, PAY_TYPE, SCHEDULE, GENDER } from '@scourage/worklog-core';
import { WorkersFilter } from './workers-filter';
import { TelegramConnect } from '../components/telegram-connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  const gw = getRequestGateway();
  const workers = await listWorkers(gw);
  const activePlaces = await loadActivePlaces(gw);
  const cities = [...new Set(workers.map((w) => w.city ?? '').filter(Boolean))].sort();
  // Filter chips = master active places ∪ every place actually assigned in the sheet.
  const places = [...new Set([...activePlaces, ...workers.flatMap((w) => w.places)])].sort();

  return (
    <main className="mx-auto max-w-4xl p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Workers</h1>
        <div className="flex items-center gap-2">
          <TelegramConnect phone={admin.phone} linked={!!admin.telegramChatId} />
          <a href="/admin/places" className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Places</a>
          <a href="/admin/shifts" className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Shifts</a>
          <a href="/admin/attendance" className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Attendance</a>
          <a href="/admin/payroll" className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Payroll</a>
          <a href="/admin/add" className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white">+ Add worker</a>
        </div>
      </div>
      <WorkersFilter
        workers={workers}
        cities={cities}
        places={places}
        enums={{ transportation: TRANSPORTATION, hebrewLevel: HEBREW_LEVEL, payType: PAY_TYPE, schedule: SCHEDULE, gender: GENDER }}
      />
    </main>
  );
}
