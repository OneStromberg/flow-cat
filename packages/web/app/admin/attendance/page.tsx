import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getRequestGateway } from '../../../lib/sheets';
import { listAttendance, listWorkers, listInstances } from '@scourage/worklog-core';
import { AttendanceClient } from './attendance-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatDate(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  const params = await searchParams;
  const from = typeof params.from === 'string' ? params.from : formatDate(-14);
  const to = typeof params.to === 'string' ? params.to : formatDate(0);

  const gw = getRequestGateway();
  const [attendance, workers, instances] = await Promise.all([
    listAttendance(gw, { from, to }),
    listWorkers(gw),
    listInstances(gw, { from: '0000-01-01', to: '9999-12-31' }),
  ]);

  // Build phone → name map from workers
  const phoneToName = new Map(workers.map((w) => [w.phone, w.name]));

  // Build instanceId → location map from instances
  const instanceToLocation = new Map(instances.map((i) => [i.id, i.location]));

  // Enrich attendance rows with workerName and location
  const rows = attendance.map((row) => ({
    ...row,
    workerName: phoneToName.get(row.employeePhone) || '—',
    location: instanceToLocation.get(row.instanceId) || '—',
  }));

  return (
    <main className="mx-auto max-w-6xl p-5">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Attendance</h1>
      </div>

      <AttendanceClient rows={rows} />
    </main>
  );
}
