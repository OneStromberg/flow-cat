import Link from 'next/link';
import { RepairOrphansButton } from './repair-orphans-button';

interface ViewSwitcherProps {
  active: 'day' | 'week' | 'month';
  dayHref: string;
  weekHref: string;
  monthHref: string;
}

const base = 'px-3 py-1.5 text-sm font-medium rounded-md';
const active = `${base} bg-gray-900 text-white`;
const inactive = `${base} border border-gray-300 text-gray-700`;

const LEGEND = [
  { bg: 'bg-emerald-500', label: 'Assigned' },
  { bg: 'bg-orange-500',  label: 'Assigned, not checked in' },
  { bg: 'bg-amber-400',   label: 'Upcoming, needs staff' },
  { bg: 'bg-rose-500',    label: 'Ongoing/past, needs staff' },
  { bg: 'bg-gray-300',    label: 'Cancelled' },
];

export function ViewSwitcher({ active: view, dayHref, weekHref, monthHref }: ViewSwitcherProps) {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* action buttons */}
        <Link href="/admin/shifts/new" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white">
          + New shift
        </Link>
        <Link href="/admin/shifts/templates" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700">
          Templates
        </Link>
        <RepairOrphansButton />

        {/* spacer */}
        <div className="flex-1" />

        {/* view switcher */}
        <div className="flex gap-1">
          <Link href={dayHref} className={view === 'day' ? active : inactive}>Day</Link>
          <Link href={weekHref} className={view === 'week' ? active : inactive}>Week</Link>
          <Link href={monthHref} className={view === 'month' ? active : inactive}>Month</Link>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3">
        {LEGEND.map(({ bg, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${bg}`} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
