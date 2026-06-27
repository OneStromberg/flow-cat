import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getRequestGateway } from '../../../lib/sheets';
import { listInstances, listAssignments } from '@scourage/worklog-core';
import type { ShiftInstance } from '@scourage/worklog-core';
import { addDays, sundayOf } from './date-utils';
import { WeekList } from './week-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InstanceWithAssigned {
  instance: ShiftInstance;
  assigned: number;
}

export interface WeekData {
  weekStart: string;
  items: InstanceWithAssigned[];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  const sp = await searchParams;

  const today = new Date().toISOString().slice(0, 10);

  const fromParam = typeof sp.from === 'string' ? sp.from : sundayOf(today);
  const weeksParam =
    typeof sp.weeks === 'string'
      ? Math.min(Math.max(parseInt(sp.weeks, 10) || 8, 1), 52)
      : 8;

  const rangeStart = fromParam;
  const rangeEnd = addDays(fromParam, weeksParam * 7 - 1);

  const gw = getRequestGateway();

  const [instances, allAssignments] = await Promise.all([
    listInstances(gw, { from: rangeStart, to: rangeEnd }),
    listAssignments(gw, {}),
  ]);

  // Build assigned-count map for instances in range
  const rangeInstanceIds = new Set(instances.map((i) => i.id));
  const assignedCountMap = new Map<string, number>();
  for (const a of allAssignments) {
    if (a.status === 'assigned' && rangeInstanceIds.has(a.instanceId)) {
      assignedCountMap.set(a.instanceId, (assignedCountMap.get(a.instanceId) ?? 0) + 1);
    }
  }

  // Build week objects
  const weeks: WeekData[] = [];
  for (let w = 0; w < weeksParam; w++) {
    const weekStart = addDays(fromParam, w * 7);
    const weekEnd = addDays(weekStart, 6);
    const items = instances
      .filter((inst) => inst.date >= weekStart && inst.date <= weekEnd)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
      .map((inst) => ({ instance: inst, assigned: assignedCountMap.get(inst.id) ?? 0 }));
    weeks.push({ weekStart, items });
  }

  // Nav: earlier = 4 more weeks prepended; loadMore = 8 more weeks appended
  const earlierHref = `?from=${addDays(fromParam, -28)}&weeks=${weeksParam + 4}`;
  const loadMoreHref = `?from=${fromParam}&weeks=${weeksParam + 8}`;

  return (
    <main className="mx-auto max-w-xl p-4">
      <WeekList weeks={weeks} earlierHref={earlierHref} loadMoreHref={loadMoreHref} />
    </main>
  );
}
