import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getRequestGateway } from '../../../lib/sheets';
import { listInstances, listAssignments } from '@scourage/worklog-core';
import type { ShiftInstance } from '@scourage/worklog-core';
import { addDays, sundayOf } from './date-utils';
import { MonthGrid } from './month-grid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Day {
  date: string;       // YYYY-MM-DD
  dayNum: number;
  inMonth: boolean;
  isToday: boolean;
  items: { instance: ShiftInstance; assigned: number }[];
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
  const currentMonth = today.slice(0, 7);
  const month = typeof sp.month === 'string' ? sp.month : currentMonth;

  const [yStr, moStr] = month.split('-');
  const y = Number(yStr);
  const mo = Number(moStr); // 1-based

  const monthStart = `${month}-01`;
  const lastDayNum = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // day 0 of next month
  const monthEnd = `${month}-${String(lastDayNum).padStart(2, '0')}`;

  const gridStart = sundayOf(monthStart);
  const gridEnd = addDays(sundayOf(monthEnd), 6);

  const gw = getRequestGateway();

  const [instances, allAssignments] = await Promise.all([
    listInstances(gw, { from: gridStart, to: gridEnd }),
    listAssignments(gw, {}),
  ]);

  // Build assigned-count map (same batching pattern as before)
  const rangeInstanceIds = new Set(instances.map((i) => i.id));
  const assignedCountMap = new Map<string, number>();
  for (const a of allAssignments) {
    if (a.status === 'assigned' && rangeInstanceIds.has(a.instanceId)) {
      assignedCountMap.set(a.instanceId, (assignedCountMap.get(a.instanceId) ?? 0) + 1);
    }
  }

  // Group instances by date, sorted by start
  const byDate = new Map<string, { instance: ShiftInstance; assigned: number }[]>();
  for (const inst of instances) {
    const entry = { instance: inst, assigned: assignedCountMap.get(inst.id) ?? 0 };
    const list = byDate.get(inst.date) ?? [];
    list.push(entry);
    byDate.set(inst.date, list);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => a.instance.start.localeCompare(b.instance.start));
  }

  // Build weeks: Day[][]
  const weeks: Day[][] = [];
  let current = gridStart;
  while (current <= gridEnd) {
    const week: Day[] = [];
    for (let d = 0; d < 7; d++) {
      const [cy, cm, cd] = current.split('-').map(Number);
      week.push({
        date: current,
        dayNum: cd,
        inMonth: cm === mo && cy === y,
        isToday: current === today,
        items: byDate.get(current) ?? [],
      });
      current = addDays(current, 1);
    }
    weeks.push(week);
  }

  // Nav
  const prevMo = mo === 1 ? 12 : mo - 1;
  const prevY = mo === 1 ? y - 1 : y;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const nextY = mo === 12 ? y + 1 : y;
  const prevMonth = `${prevY}-${String(prevMo).padStart(2, '0')}`;
  const nextMonth = `${nextY}-${String(nextMo).padStart(2, '0')}`;

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthLabel = `${MONTHS[mo - 1]} ${y}`;

  return (
    <main className="mx-auto max-w-2xl p-4">
      <MonthGrid
        monthLabel={monthLabel}
        weeks={weeks}
        prevHref={`?month=${prevMonth}`}
        nextHref={`?month=${nextMonth}`}
      />
    </main>
  );
}
