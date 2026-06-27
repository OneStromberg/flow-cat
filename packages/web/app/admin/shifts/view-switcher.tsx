import Link from 'next/link';

interface ViewSwitcherProps {
  active: 'day' | 'week' | 'month';
  dayHref: string;
  weekHref: string;
  monthHref: string;
}

const base = 'px-3 py-1.5 text-sm font-medium rounded-md';
const active = `${base} bg-gray-900 text-white`;
const inactive = `${base} border border-gray-300 text-gray-700`;

export function ViewSwitcher({ active: view, dayHref, weekHref, monthHref }: ViewSwitcherProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {/* action buttons */}
      <Link href="/admin/shifts/new" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white">
        + New shift
      </Link>
      <Link href="/admin/shifts/templates" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700">
        Templates
      </Link>

      {/* spacer */}
      <div className="flex-1" />

      {/* view switcher */}
      <div className="flex gap-1">
        <Link href={dayHref} className={view === 'day' ? active : inactive}>Day</Link>
        <Link href={weekHref} className={view === 'week' ? active : inactive}>Week</Link>
        <Link href={monthHref} className={view === 'month' ? active : inactive}>Month</Link>
      </div>
    </div>
  );
}
