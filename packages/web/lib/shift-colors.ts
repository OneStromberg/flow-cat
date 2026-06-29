import { localWallClockToUTC } from '@scourage/worklog-core';

export type ShiftStatusColor = 'green' | 'orange' | 'yellow' | 'red' | 'gray';

export function shiftStatusColor(args: {
  status: string; assigned: number; headcount: number; checkedIn: number;
  date: string; start: string; nowISO: string; tz: string; graceMins: number;
}): ShiftStatusColor {
  if (args.status === 'cancelled') return 'gray';
  const now = Date.parse(args.nowISO);
  const startMs = Date.parse(localWallClockToUTC(args.date, args.start, args.tz));
  const started = Number.isFinite(now) && Number.isFinite(startMs) && now >= startMs + args.graceMins * 60000;
  if (args.assigned < args.headcount) return started ? 'red' : 'yellow';
  if (args.checkedIn >= args.headcount) return 'green';
  return started ? 'orange' : 'green';
}

export function shiftColorChipClass(color: ShiftStatusColor): string {
  switch (color) {
    case 'green': return 'bg-emerald-500 text-white';
    case 'orange': return 'bg-orange-500 text-white';
    case 'yellow': return 'bg-amber-400 text-gray-900';
    case 'red': return 'bg-rose-500 text-white';
    case 'gray': return 'bg-gray-300 text-gray-500';
  }
}
