import { redirect } from 'next/navigation';
import { requireManagerOrAdmin } from '../../../lib/session';
import { getRequestGateway } from '../../../lib/sheets';
import { listLeave, listWorkers, LEAVE_TYPES } from '@scourage/worklog-core';
import { LeaveClient } from './leave-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LeavePage() {
  const admin = await requireManagerOrAdmin();
  if (!admin) redirect('/');

  const gw = getRequestGateway();
  const [allLeave, workers] = await Promise.all([
    listLeave(gw, {}),
    listWorkers(gw),
  ]);

  const phoneToName = new Map(workers.map((w) => [w.phone, w.name]));
  const leaves = allLeave.map((l) => ({
    ...l,
    workerName: phoneToName.get(l.employeePhone) || l.employeePhone,
  }));

  const activeWorkers = workers.filter((w) => w.active);

  return (
    <main className="mx-auto max-w-2xl p-5">
      <h1 className="text-xl font-semibold mb-6">Leave</h1>
      <LeaveClient leaves={leaves} workers={activeWorkers} types={[...LEAVE_TYPES]} />
    </main>
  );
}
