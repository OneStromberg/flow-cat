import { redirect } from 'next/navigation';
import { requireWorker } from '../../../lib/session';
import { getGateway, COMPANY_TZ } from '../../../lib/sheets';
import {
  listInstances,
  listAssignments,
  listAttendance,
  todayISO,
  type ShiftInstance,
  type Attendance,
} from '@scourage/worklog-core';
import { CheckinClient } from './checkin-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface InstanceWithAttendance {
  instance: ShiftInstance;
  attendance: Attendance | null;
}

export default async function CheckinPage() {
  const worker = await requireWorker();
  if (!worker || !worker.active) redirect('/login');

  const gw = getGateway();
  const today = todayISO(COMPANY_TZ);

  // Load all today's instances and this worker's active assignments + attendance
  const [todayInstances, workerAssignments, workerAttendance] = await Promise.all([
    listInstances(gw, { from: today, to: today }),
    listAssignments(gw, { employeePhone: worker.phone }),
    listAttendance(gw, { employeePhone: worker.phone }),
  ]);

  // Filter instances assigned to this worker
  const assignedInstanceIds = new Set(workerAssignments.map((a) => a.instanceId));
  const assignedInstances = todayInstances.filter((i) => assignedInstanceIds.has(i.id));

  // Attach attendance per instance
  const items: InstanceWithAttendance[] = assignedInstances.map((instance) => {
    // Find the most relevant attendance record: prefer open, then closed
    const records = workerAttendance.filter((a) => a.instanceId === instance.id);
    const openRecord = records.find((a) => a.status === 'open') ?? null;
    const closedRecord = records.find((a) => a.status === 'closed' || a.status === 'corrected') ?? null;
    return {
      instance,
      attendance: openRecord ?? closedRecord ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="text-xl font-semibold">Check in / out</h1>
      <p className="mt-1 text-sm text-gray-500">Today · {today}</p>
      <div className="mt-6">
        <CheckinClient items={items} workerName={worker.name ?? worker.phone} />
      </div>
    </main>
  );
}
