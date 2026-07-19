import { notFound, redirect } from 'next/navigation';
import { requireManagerOrAdmin } from '../../../../../lib/session';
import { getRequestGateway } from '../../../../../lib/sheets';
import { listInstances, listAssignments, listWorkers, listTemplates, listPlaces, resolveAssignmentRate } from '@scourage/worklog-core';
import type { ShiftInstance, ShiftAssignment, Worker } from '@scourage/worklog-core';
import { InstanceDetail } from './instance-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface AssignmentWithName extends ShiftAssignment {
  workerName: string;
  effectiveRate: number;
}

export default async function InstancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireManagerOrAdmin();
  if (!admin) redirect('/');

  const { id } = await params;
  const gw = getRequestGateway();

  const [allInstances, assignments, workers, templates, places] = await Promise.all([
    listInstances(gw, { from: '0000-01-01', to: '9999-12-31' }),
    listAssignments(gw, { instanceId: id }),
    listWorkers(gw),
    listTemplates(gw),
    listPlaces(gw),
  ]);

  const instance: ShiftInstance | undefined = allInstances.find((i) => i.id === id);
  if (!instance) notFound();

  const tpl = templates.find((t) => t.id === instance.templateId);
  const place = places.find((p) => p.name === instance.location);

  const workerByPhone = new Map<string, Worker>(workers.map((w) => [w.phone, w]));

  const assignmentsWithNames: AssignmentWithName[] = assignments.map((a) => {
    const worker = workerByPhone.get(a.employeePhone);
    return {
      ...a,
      workerName: worker?.name ?? a.employeePhone,
      effectiveRate: resolveAssignmentRate(
        a.rate ?? '',
        worker?.payRate ?? '',
        tpl?.rate ?? '',
        place?.baseRate ?? '',
      ),
    };
  });

  return (
    <main className="mx-auto max-w-2xl p-4">
      <InstanceDetail
        instance={instance}
        assignments={assignmentsWithNames}
        workers={workers}
        role={tpl?.label ?? ''}
        instructions={tpl?.instructions ?? ''}
      />
    </main>
  );
}
