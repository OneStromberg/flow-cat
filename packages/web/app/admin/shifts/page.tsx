import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getRequestGateway } from '../../../lib/sheets';
import { listInstances, listAssignments } from '@scourage/worklog-core';
import type { ShiftInstance } from '@scourage/worklog-core';
import { WeekGrid } from './week-grid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Date helpers ──────────────────────────────────────────────────────────────

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Return the ISO date of the Sunday on or before the given ISO date. */
function sundayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return addDays(iso, -dt.getUTCDay());
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InstanceWithAssigned {
  instance: ShiftInstance;
  assigned: number;
}

export interface DayData {
  date: string;
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
  const weekParam = typeof sp.week === 'string' ? sp.week : undefined;

  const today = new Date().toISOString().slice(0, 10);
  const weekStart = sundayOf(weekParam ?? today);
  const weekEnd = addDays(weekStart, 6);

  const weekDays: string[] = [];
  for (let i = 0; i < 7; i++) weekDays.push(addDays(weekStart, i));

  const prevWeek = addDays(weekStart, -7);
  const nextWeek = addDays(weekStart, 7);

  const gw = getRequestGateway();

  const [instances, allAssignments] = await Promise.all([
    listInstances(gw, { from: weekStart, to: weekEnd }),
    listAssignments(gw, {}),
  ]);

  // Build a Set of instance IDs in this week for fast lookup
  const weekInstanceIds = new Set(instances.map((i) => i.id));

  // Count assigned (status=assigned) per instanceId for instances in this week
  const assignedCountMap = new Map<string, number>();
  for (const a of allAssignments) {
    if (a.status === 'assigned' && weekInstanceIds.has(a.instanceId)) {
      assignedCountMap.set(a.instanceId, (assignedCountMap.get(a.instanceId) ?? 0) + 1);
    }
  }

  // Group instances by date
  const byDate = new Map<string, InstanceWithAssigned[]>();
  for (const date of weekDays) byDate.set(date, []);
  for (const inst of instances) {
    const list = byDate.get(inst.date);
    if (list) {
      list.push({ instance: inst, assigned: assignedCountMap.get(inst.id) ?? 0 });
    }
  }

  const days: DayData[] = weekDays.map((date) => ({
    date,
    items: byDate.get(date) ?? [],
  }));

  return (
    <main className="mx-auto max-w-5xl p-4">
      <WeekGrid
        weekStart={weekStart}
        days={days}
        prevWeek={prevWeek}
        nextWeek={nextWeek}
      />
    </main>
  );
}
