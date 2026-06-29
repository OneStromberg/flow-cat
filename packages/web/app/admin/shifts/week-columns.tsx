import Link from 'next/link';
import type { ShiftInstance } from '@scourage/worklog-core';
import { shiftStatusColor, shiftColorChipClass } from '../../../lib/shift-colors';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtMonDay(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

interface WeekColumnsProps {
  weekStart: string; // YYYY-MM-DD (Sunday)
  days: { date: string; items: { instance: ShiftInstance; assigned: number; checkedIn: number; graceMins: number }[] }[];
  prevHref: string;
  nextHref: string;
  nowISO: string;
  tz: string;
}

export function WeekColumns({ weekStart, days, prevHref, nextHref, nowISO, tz }: WeekColumnsProps) {
  return (
    <div>
      {/* Week nav */}
      <div className="mb-3 flex items-center justify-between">
        <Link href={prevHref} className="px-2 py-1 text-lg text-gray-500 hover:text-gray-900">‹</Link>
        <span className="text-base font-bold text-gray-900">Week of {fmtMonDay(weekStart)}</span>
        <Link href={nextHref} className="px-2 py-1 text-lg text-gray-500 hover:text-gray-900">›</Link>
      </div>

      {/* 7-column scrollable row */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map(({ date, items }, idx) => {
          const [, m, d] = date.split('-').map(Number);
          return (
            <div key={date} className="min-w-[9rem] flex-shrink-0">
              {/* Column header */}
              <div className="mb-1 text-center text-xs font-semibold text-gray-500">
                {WEEKDAYS[idx]}<br />
                <span className="text-gray-400">{MONTHS[m - 1]} {d}</span>
              </div>

              {/* Shift cards */}
              {items.length === 0 ? (
                <p className="text-center text-sm text-gray-300">—</p>
              ) : (
                <div className="space-y-1">
                  {items.map(({ instance, assigned, checkedIn, graceMins }) => {
                    const cancelled = instance.status === 'cancelled';
                    const understaffed = !cancelled && assigned < instance.headcount;
                    const color = shiftStatusColor({
                      status: instance.status,
                      assigned,
                      headcount: instance.headcount,
                      checkedIn,
                      date: instance.date,
                      start: instance.start,
                      nowISO,
                      tz,
                      graceMins,
                    });
                    const chipClass = shiftColorChipClass(color);
                    return (
                      <Link
                        key={instance.id}
                        href={`/admin/shifts/instances/${instance.id}`}
                        className={`block rounded p-1.5 text-xs leading-tight border-l-4 ${cancelled ? 'opacity-50 line-through border-gray-300 bg-gray-50' : `border-transparent ${chipClass}`}`}
                      >
                        <div className="font-medium truncate">{instance.location || '—'}</div>
                        <div className="text-[10px] opacity-80">{instance.start}–{instance.end}</div>
                        <div className="text-[10px]">{assigned}/{instance.headcount}{understaffed && ' ⚠'}</div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
