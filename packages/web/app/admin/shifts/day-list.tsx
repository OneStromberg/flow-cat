import Link from 'next/link';
import type { ShiftInstance } from '@scourage/worklog-core';
import { shiftStatusColor, shiftColorChipClass } from '../../../lib/shift-colors';
import { LocationGroup } from './location-group';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[dow]}, ${MONTHS[m - 1]} ${d}`;
}

/** Map status color → dot bg class for the day-list bullet. */
function dotBgClass(chipClass: string): string {
  // chipClass starts with 'bg-...' — extract just the bg portion
  return chipClass.split(' ')[0];
}

interface DayListProps {
  date: string;
  items: { instance: ShiftInstance; assigned: number; presentNow: number; end: string; graceMins: number; workerNames: string[] }[];
  prevHref: string;
  nextHref: string;
  nowISO: string;
  tz: string;
}

export function DayList({ date, items, prevHref, nextHref, nowISO, tz }: DayListProps) {
  return (
    <div>
      {/* Day nav */}
      <div className="mb-3 flex items-center justify-between">
        <Link href={prevHref} className="px-2 py-1 text-lg text-gray-500 hover:text-gray-900">‹</Link>
        <span className="text-base font-bold text-gray-900">{fmtDate(date)}</span>
        <Link href={nextHref} className="px-2 py-1 text-lg text-gray-500 hover:text-gray-900">›</Link>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">No shifts this day.</p>
      ) : (() => {
        // Group items by location, preserving first-seen order
        const groups = new Map<string, typeof items>();
        for (const item of items) {
          const loc = item.instance.location || '—';
          if (!groups.has(loc)) groups.set(loc, []);
          groups.get(loc)!.push(item);
        }
        return (
          <div className="space-y-1">
            {Array.from(groups.entries()).map(([loc, groupItems]) => {
              const sumAssigned = groupItems.reduce((s, i) => s + i.assigned, 0);
              const sumHeadcount = groupItems.reduce((s, i) => s + i.instance.headcount, 0);
              return (
                <LocationGroup key={loc} title={loc} summary={`${sumAssigned}/${sumHeadcount}`} defaultOpen>
                  {groupItems.map(({ instance, assigned, presentNow, end, graceMins, workerNames }) => {
                    const cancelled = instance.status === 'cancelled';
                    const understaffed = !cancelled && assigned < instance.headcount;
                    const color = shiftStatusColor({
                      status: instance.status,
                      assigned,
                      headcount: instance.headcount,
                      presentNow,
                      date: instance.date,
                      start: instance.start,
                      end,
                      nowISO,
                      tz,
                      graceMins,
                    });
                    const chipClass = shiftColorChipClass(color);
                    return (
                      <Link
                        key={instance.id}
                        href={`/admin/shifts/instances/${instance.id}`}
                        className={`block rounded-lg border p-3 ${cancelled ? 'opacity-50 border-gray-200' : 'border-gray-200 hover:border-gray-400'}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 h-3 w-3 flex-shrink-0 rounded-full ${dotBgClass(chipClass)}`} />
                          <div className="min-w-0 flex-1">
                            <div className={`font-semibold text-sm ${cancelled ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                              {instance.location || '—'}
                            </div>
                            <div className="text-xs text-gray-500">{instance.start}–{instance.end}</div>
                            <div className="text-xs text-gray-500">
                              {assigned}/{instance.headcount} assigned
                              {understaffed && <span className="ml-1 text-amber-600 font-medium">⚠ needs staff</span>}
                              {cancelled && <span className="ml-1 text-gray-400">(cancelled)</span>}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {workerNames.length > 0 ? workerNames.join(', ') : '— unstaffed —'}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </LocationGroup>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
