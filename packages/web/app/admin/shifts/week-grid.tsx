import Link from 'next/link';
import type { DayData } from './page';

// ── Constants ─────────────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAY_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function shortDate(iso: string): string {
  // Returns M/D e.g. "6/22"
  const [, m, d] = iso.split('-').map(Number);
  return `${m}/${d}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface WeekGridProps {
  weekStart: string;
  days: DayData[];
  prevWeek: string;
  nextWeek: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WeekGrid({ weekStart, days, prevWeek, nextWeek }: WeekGridProps) {
  return (
    <div>
      {/* Action buttons */}
      <div className="mb-4 flex gap-2">
        <Link
          href="/admin/shifts/new"
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white"
        >
          + New shift
        </Link>
        <Link
          href="/admin/shifts/templates"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
        >
          Templates
        </Link>
      </div>

      {/* Week navigation */}
      <div className="mb-3 flex items-center gap-2">
        <Link
          href={`/admin/shifts?week=${prevWeek}`}
          className="rounded px-2 py-1 text-lg font-medium text-gray-600 hover:bg-gray-100"
          aria-label="Previous week"
        >
          ‹
        </Link>
        <span className="flex-1 text-center text-sm font-semibold text-gray-800">
          Week of {weekStart}
        </span>
        <Link
          href={`/admin/shifts?week=${nextWeek}`}
          className="rounded px-2 py-1 text-lg font-medium text-gray-600 hover:bg-gray-100"
          aria-label="Next week"
        >
          ›
        </Link>
      </div>

      {/* 7-column day grid — horizontally scrollable on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((day) => (
          <div key={day.date} className="min-w-[8.5rem] flex-shrink-0">
            {/* Day header */}
            <div className="mb-1 rounded-t bg-gray-100 px-2 py-1 text-center text-xs font-semibold text-gray-600">
              {weekdayLabel(day.date)}
              <br />
              <span className="font-normal text-gray-400">{shortDate(day.date)}</span>
            </div>

            {/* Instance cards */}
            <div className="space-y-1">
              {day.items.length === 0 ? (
                <div className="rounded border border-dashed border-gray-200 px-2 py-3 text-center text-xs text-gray-300">
                  —
                </div>
              ) : (
                day.items.map(({ instance, assigned }) => {
                  const cancelled = instance.status === 'cancelled';
                  const needsStaff =
                    !cancelled && assigned < instance.headcount;

                  return (
                    <Link
                      key={instance.id}
                      href={`/admin/shifts/instances/${instance.id}`}
                      className={[
                        'block rounded border px-2 py-1.5 text-xs hover:bg-gray-50',
                        cancelled
                          ? 'border-gray-200 text-gray-400'
                          : needsStaff
                          ? 'border-amber-300 bg-amber-50'
                          : 'border-gray-200 bg-white',
                      ].join(' ')}
                    >
                      <div className={cancelled ? 'line-through text-gray-400' : 'font-medium'}>
                        {instance.start}–{instance.end}
                      </div>
                      <div className={cancelled ? 'line-through text-gray-400' : 'text-gray-500'}>
                        {instance.location}
                      </div>
                      <div
                        className={
                          cancelled
                            ? 'line-through text-gray-400'
                            : needsStaff
                            ? 'text-amber-700'
                            : 'text-gray-500'
                        }
                      >
                        {assigned}/{instance.headcount}
                        {needsStaff && (
                          <span className="ml-1 text-amber-600">⚠ needs staff</span>
                        )}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
