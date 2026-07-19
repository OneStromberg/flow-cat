import { notFound, redirect } from 'next/navigation';
import { requireManagerOrAdmin } from '../../../../../lib/session';
import { getRequestGateway } from '../../../../../lib/sheets';
import {
  listTemplates,
  loadActivePlaces,
  listWorkers,
  listRecurring,
  listInstances,
  listAssignments,
  type ShiftTemplate,
  type Worker,
  type RecurringAssignment,
  type ShiftInstance,
} from '@scourage/worklog-core';
import { TemplateDetail } from './template-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export interface InstanceWithCount extends ShiftInstance {
  assignedCount: number;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireManagerOrAdmin();
  if (!admin) redirect('/');

  const { id } = await params;
  const gw = getRequestGateway();

  const [templates, places, workers, recurring] = await Promise.all([
    listTemplates(gw),
    loadActivePlaces(gw),
    listWorkers(gw),
    listRecurring(gw, id),
  ]);

  const template: ShiftTemplate | undefined = templates.find((t) => t.id === id);
  if (!template) notFound();

  const t0 = today();
  const t42 = addDays(t0, 42);

  const [rawInstances, allAssignments] = await Promise.all([
    listInstances(gw, { from: t0, to: t42 }),
    listAssignments(gw, {}),
  ]);

  // Only count assignments for this template's instances (prefix filter avoids scanning unrelated rows)
  // ponytail: in-memory scan over all assignments; add instanceId filter to listAssignments if fleet grows large
  const prefix = id + '_';
  const countMap = new Map<string, number>();
  for (const a of allAssignments) {
    if (a.instanceId.startsWith(prefix)) {
      countMap.set(a.instanceId, (countMap.get(a.instanceId) ?? 0) + 1);
    }
  }

  const instances: InstanceWithCount[] = rawInstances
    .filter((i) => i.id.startsWith(prefix))
    .map((i) => ({ ...i, assignedCount: countMap.get(i.id) ?? 0 }));

  return (
    <TemplateDetail
      template={template}
      places={places}
      workers={workers}
      recurring={recurring}
      instances={instances}
    />
  );
}
