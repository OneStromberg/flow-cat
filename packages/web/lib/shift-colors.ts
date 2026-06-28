export type ShiftStatusColor = 'green' | 'yellow' | 'red' | 'gray';

function addOneDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

export function shiftStatusColor(args: {
  status: string;
  assigned: number;
  headcount: number;
  date: string;
  start: string;
  end: string;
  nowISO: string;
}): ShiftStatusColor {
  if (args.status === 'cancelled') return 'gray';
  if (args.assigned >= args.headcount) return 'green';
  // understaffed
  const startDT = `${args.date}T${args.start}`;
  const endDT =
    args.end < args.start
      ? `${addOneDay(args.date)}T${args.end}`
      : `${args.date}T${args.end}`;
  const now = args.nowISO;
  if (now >= startDT && now <= endDT) return 'red'; // ongoing & unstaffed
  if (now < startDT) return 'yellow';               // upcoming & unstaffed
  return 'red';                                     // past & was unstaffed
}

/** Tailwind class string for a shift chip (small, e.g. month view). */
export function shiftColorChipClass(color: ShiftStatusColor): string {
  switch (color) {
    case 'green': return 'bg-emerald-500 text-white';
    case 'yellow': return 'bg-amber-400 text-gray-900';
    case 'red': return 'bg-rose-500 text-white';
    case 'gray': return 'bg-gray-300 text-gray-500';
  }
}
