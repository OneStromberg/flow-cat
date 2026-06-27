import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getRequestGateway } from '../../../lib/sheets';
import { listInstances, listAssignments, listWorkers } from '@scourage/worklog-core';
import type { ShiftInstance } from '@scourage/worklog-core';
import { addDays, sundayOf } from './date-utils';
import { MonthGrid } from './month-grid';
import { WeekColumns } from './week-columns';
import { DayList } from './day-list';
import { ViewSwitcher } from './view-switcher';

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

  const rawView = typeof sp.view === 'string' ? sp.view : 'month';
  const view = rawView === 'day' || rawView === 'week' ? rawView : 'month';

  // anchor date for day/week; month string for month view
  const date = typeof sp.date === 'string' ? sp.date : today;
  const month = typeof sp.month === 'string' ? sp.month : date.slice(0, 7);

  // ── Load range ──────────────────────────────────────────────────────────────
  let from: string;
  let to: string;

  if (view === 'day') {
    from = date;
    to = date;
  } else if (view === 'week') {
    from = sundayOf(date);
    to = addDays(from, 6);
  } else {
    // month
    const [yStr, moStr] = month.split('-');
    const y = Number(yStr);
    const mo = Number(moStr);
    const monthStart = `${month}-01`;
    const lastDayNum = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const monthEnd = `${month}-${String(lastDayNum).padStart(2, '0')}`;
    from = sundayOf(monthStart);
    to = addDays(sundayOf(monthEnd), 6);
  }

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const gw = getRequestGateway();

  const [instances, allAssignments, workers] = await Promise.all([
    listInstances(gw, { from, to }),
    listAssignments(gw, {}),
    view === 'day' ? listWorkers(gw) : Promise.resolve(null),
  ]);

  // ── Assigned-count map ──────────────────────────────────────────────────────
  const rangeInstanceIds = new Set(instances.map((i) => i.id));
  const assignedCountMap = new Map<string, number>();
  for (const a of allAssignments) {
    if (a.status === 'assigned' && rangeInstanceIds.has(a.instanceId)) {
      assignedCountMap.set(a.instanceId, (assignedCountMap.get(a.instanceId) ?? 0) + 1);
    }
  }

  // ── Worker names map (day view only) ────────────────────────────────────────
  const workerNamesMap = new Map<string, string[]>(); // instanceId → names
  if (workers) {
    const phoneToName = new Map(workers.map((w) => [w.phone, w.name]));
    for (const a of allAssignments) {
      if (a.status === 'assigned' && rangeInstanceIds.has(a.instanceId)) {
        const name = phoneToName.get(a.employeePhone) ?? a.employeePhone;
        const list = workerNamesMap.get(a.instanceId) ?? [];
        list.push(name);
        workerNamesMap.set(a.instanceId, list);
      }
    }
  }

  // ── Group by date ───────────────────────────────────────────────────────────
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

  // ── Switcher hrefs ──────────────────────────────────────────────────────────
  const switcherDate = view === 'month' ? today : date;
  const switcherMonth = view === 'month' ? month : date.slice(0, 7);
  const dayHref = `?view=day&date=${switcherDate}`;
  const weekHref = `?view=week&date=${switcherDate}`;
  const monthHref = `?view=month&month=${switcherMonth}`;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-2xl p-4">
      <ViewSwitcher active={view} dayHref={dayHref} weekHref={weekHref} monthHref={monthHref} />

      {view === 'month' && (() => {
        const [yStr, moStr] = month.split('-');
        const y = Number(yStr);
        const mo = Number(moStr);
        const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthLabel = `${MONTHS[mo - 1]} ${y}`;

        const prevMo = mo === 1 ? 12 : mo - 1;
        const prevY = mo === 1 ? y - 1 : y;
        const nextMo = mo === 12 ? 1 : mo + 1;
        const nextY = mo === 12 ? y + 1 : y;
        const prevMonth = `${prevY}-${String(prevMo).padStart(2, '0')}`;
        const nextMonth = `${nextY}-${String(nextMo).padStart(2, '0')}`;

        // Build weeks
        const weeks: Day[][] = [];
        let current = from;
        while (current <= to) {
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

        return (
          <MonthGrid
            monthLabel={monthLabel}
            weeks={weeks}
            prevHref={`?view=month&month=${prevMonth}`}
            nextHref={`?view=month&month=${nextMonth}`}
          />
        );
      })()}

      {view === 'week' && (() => {
        const weekStart = sundayOf(date);
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = addDays(weekStart, i);
          return { date: d, items: byDate.get(d) ?? [] };
        });
        const prevWeek = addDays(weekStart, -7);
        const nextWeek = addDays(weekStart, 7);
        return (
          <WeekColumns
            weekStart={weekStart}
            days={days}
            prevHref={`?view=week&date=${prevWeek}`}
            nextHref={`?view=week&date=${nextWeek}`}
          />
        );
      })()}

      {view === 'day' && (() => {
        const baseItems = byDate.get(date) ?? [];
        const items = baseItems.map(({ instance, assigned }) => ({
          instance,
          assigned,
          workerNames: workerNamesMap.get(instance.id) ?? [],
        }));
        const prevDay = addDays(date, -1);
        const nextDay = addDays(date, 1);
        return (
          <DayList
            date={date}
            items={items}
            prevHref={`?view=day&date=${prevDay}`}
            nextHref={`?view=day&date=${nextDay}`}
          />
        );
      })()}
    </main>
  );
}
