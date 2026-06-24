import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getGateway } from '../../../lib/sheets';
import {
  listTemplates,
  loadActivePlaces,
  listWorkers,
  listRecurring,
  listInstances,
  listAssignments,
} from '@scourage/worklog-core';
import { ShiftsAdmin } from './shifts-admin';
import type { ShiftInstance } from '@scourage/worklog-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export interface InstanceWithCount extends ShiftInstance {
  assignedCount: number;
}

export default async function ShiftsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  const gw = getGateway();
  const today = new Date().toISOString().slice(0, 10);
  const horizonEnd = addDays(today, 42);

  const [templates, places, workers, allInstances] = await Promise.all([
    listTemplates(gw),
    loadActivePlaces(gw),
    listWorkers(gw),
    listInstances(gw, { from: today, to: horizonEnd }),
  ]);

  // For each template load its recurring assignments and filter instances
  const templateData = await Promise.all(
    templates.map(async (t) => {
      const recurring = await listRecurring(gw, t.id);

      // Filter instances belonging to this template
      const tInstances = allInstances.filter(
        (i) => i.templateId === t.id || i.id.startsWith(t.id + '_'),
      );

      // For each instance get assigned count
      const instances: InstanceWithCount[] = await Promise.all(
        tInstances.map(async (inst) => {
          const assignments = await listAssignments(gw, { instanceId: inst.id });
          return { ...inst, assignedCount: assignments.length };
        }),
      );

      return { templateId: t.id, recurring, instances };
    }),
  );

  // Build lookup maps keyed by templateId
  const recurringByTemplate = Object.fromEntries(
    templateData.map(({ templateId, recurring }) => [templateId, recurring]),
  );
  const instancesByTemplate = Object.fromEntries(
    templateData.map(({ templateId, instances }) => [templateId, instances]),
  );

  return (
    <main className="mx-auto max-w-4xl p-5">
      <h1 className="text-xl font-semibold">Shift Templates</h1>
      <ShiftsAdmin
        templates={templates}
        places={places}
        workers={workers}
        recurringByTemplate={recurringByTemplate}
        instancesByTemplate={instancesByTemplate}
      />
    </main>
  );
}
