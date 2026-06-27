import Link from 'next/link';
import type { Day } from './page';
import { colorFor } from './shift-colors';

interface MonthGridProps {
  monthLabel: string;
  weeks: Day[][];
  prevHref: string;
  nextHref: string;
}

export function MonthGrid({ monthLabel, weeks, prevHref, nextHref }: MonthGridProps) {
  return (
    <div>
      {/* Month nav */}
      <div className="mb-2 flex items-center justify-between">
        <Link href={prevHref} className="px-2 py-1 text-lg text-gray-500 hover:text-gray-900">
          ‹
        </Link>
        <span className="text-base font-bold text-gray-900">{monthLabel}</span>
        <Link href={nextHref} className="px-2 py-1 text-lg text-gray-500 hover:text-gray-900">
          ›
        </Link>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 mb-px">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="py-1 text-center text-[11px] font-medium text-gray-400">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-gray-200">
        {weeks.flat().map((day) => {
          const MAX = 3;
          const overflow = day.items.length - MAX;
          return (
            <div
              key={day.date}
              className="min-h-[4.5rem] bg-white p-1"
            >
              {/* Day number */}
              <div className="flex justify-end">
                {day.isToday ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                    {day.dayNum}
                  </span>
                ) : (
                  <span className={`text-[11px] font-medium ${day.inMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                    {day.dayNum}
                  </span>
                )}
              </div>

              {/* Shift chips */}
              <div className="mt-0.5 space-y-px">
                {day.items.slice(0, MAX).map(({ instance, assigned }) => {
                  const cancelled = instance.status === 'cancelled';
                  const understaffed = !cancelled && assigned < instance.headcount;
                  const colorClass = cancelled
                    ? 'bg-gray-200 text-gray-400 line-through'
                    : colorFor(instance.location);
                  return (
                    <Link
                      key={instance.id}
                      href={`/admin/shifts/instances/${instance.id}`}
                      className={`block rounded px-1 py-0.5 text-[10px] leading-tight truncate ${colorClass}`}
                    >
                      {understaffed && '⚠ '}{instance.location || instance.start}
                    </Link>
                  );
                })}
                {overflow > 0 && (
                  <div className="text-[10px] leading-tight text-gray-400 px-1">
                    +{overflow} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
