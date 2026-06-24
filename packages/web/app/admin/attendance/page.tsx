import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getGateway } from '../../../lib/sheets';
import { listAttendance } from '@scourage/worklog-core';
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

  const attendance = await listAttendance(getGateway(), { from, to });

  return (
    <main className="mx-auto max-w-6xl p-5">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Attendance</h1>
      </div>

      <AttendanceClient rows={attendance} />
    </main>
  );
}
