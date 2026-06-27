import Link from 'next/link';
import type { WeekData } from './page';

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAY_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}/${d}`;
}

function shortMonthDay(iso: string): string {
  const [, mo, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[mo - 1]} ${d}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface WeekListProps {
  weeks: WeekData[];
  earlierHref: string;
  loadMoreHref: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WeekList({ weeks, earlierHref, loadMoreHref }: WeekListProps) {
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

      {/* Earlier weeks link */}
      <Link
        href={earlierHref}
        className="mb-4 block text-center text-sm text-gray-500 hover:text-gray-800"
      >
        ‹ Earlier weeks
      </Link>

      {/* Week sections */}
      {weeks.map(({ weekStart, items }) => (
        <section key={weekStart} className="mb-6">
          {/* Sticky-ish week header */}
          <h2 className="sticky top-0 z-10 bg-white py-1 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100 mb-2">
            Week of {shortMonthDay(weekStart)}
          </h2>

          {items.length === 0 ? (
            <p className="py-2 text-center text-xs text-gray-300">— no shifts —</p>
          ) : (
            <div className="space-y-1">
              {items.map(({ instance, assigned }) => {
                const cancelled = instance.status === 'cancelled';
                const needsStaff = !cancelled && assigned < instance.headcount;

                return (
                  <Link
                    key={instance.id}
                    href={`/admin/shifts/instances/${instance.id}`}
                    className={[
                      'flex items-center gap-2 rounded border px-3 py-2.5 text-sm hover:bg-gray-50',
                      cancelled
                        ? 'border-gray-200 text-gray-400'
                        : needsStaff
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-gray-200 bg-white',
                    ].join(' ')}
                  >
                    {/* Day + date */}
                    <span className={`w-16 shrink-0 font-medium ${cancelled ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {weekdayLabel(instance.date)} {shortDate(instance.date)}
                    </span>

                    {/* Time */}
                    <span className={`shrink-0 ${cancelled ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                      {instance.start}–{instance.end}
                    </span>

                    {/* Location */}
                    <span className={`min-w-0 flex-1 truncate ${cancelled ? 'line-through text-gray-400' : 'text-gray-500'}`}>
                      {instance.location}
                    </span>

                    {/* Staff count */}
                    <span className={`shrink-0 text-xs ${cancelled ? 'line-through text-gray-400' : needsStaff ? 'text-amber-700' : 'text-gray-500'}`}>
                      {assigned}/{instance.headcount}
                      {needsStaff && <span className="ml-1">⚠ needs staff</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ))}

      {/* Load more */}
      <Link
        href={loadMoreHref}
        className="block w-full rounded-lg border border-gray-300 py-3 text-center text-sm font-medium text-gray-600 hover:bg-gray-50"
      >
        Load more weeks
      </Link>
    </div>
  );
}
