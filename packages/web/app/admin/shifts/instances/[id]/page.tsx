import { notFound, redirect } from 'next/navigation';
import { requireAdmin } from '../../../../../lib/session';
import { getRequestGateway } from '../../../../../lib/sheets';
import { listInstances, listAssignments, listWorkers } from '@scourage/worklog-core';
import type { ShiftInstance, ShiftAssignment, Worker } from '@scourage/worklog-core';
import { InstanceDetail } from './instance-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface AssignmentWithName extends ShiftAssignment {
  workerName: string;
}

export default async function InstancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  const { id } = await params;
  const gw = getRequestGateway();

  const [allInstances, assignments, workers] = await Promise.all([
    listInstances(gw, { from: '0000-01-01', to: '9999-12-31' }),
    listAssignments(gw, { instanceId: id }),
    listWorkers(gw),
  ]);

  const instance: ShiftInstance | undefined = allInstances.find((i) => i.id === id);
  if (!instance) notFound();

  const workerByPhone = new Map<string, Worker>(workers.map((w) => [w.phone, w]));

  const assignmentsWithNames: AssignmentWithName[] = assignments.map((a) => ({
    ...a,
    workerName: workerByPhone.get(a.employeePhone)?.name ?? a.employeePhone,
  }));

  return (
    <main className="mx-auto max-w-2xl p-4">
      <InstanceDetail
        instance={instance}
        assignments={assignmentsWithNames}
        workers={workers}
      />
    </main>
  );
}
