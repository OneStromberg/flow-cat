import { localWallClockToUTC } from '@scourage/worklog-core';

export type ShiftStatusColor = 'green' | 'orange' | 'yellow' | 'red' | 'gray';

function addOneDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export function shiftStatusColor(args: {
  status: string; assigned: number; headcount: number; presentNow: number;
  date: string; start: string; end: string; nowISO: string; tz: string; graceMins: number;
}): ShiftStatusColor {
  if (args.status === 'cancelled') return 'gray';
  const now = Date.parse(args.nowISO);
  const startMs = Date.parse(localWallClockToUTC(args.date, args.start, args.tz));
  const endDate = args.end < args.start ? addOneDay(args.date) : args.date;
  const endMs = Date.parse(localWallClockToUTC(endDate, args.end, args.tz));
  const started = Number.isFinite(now) && Number.isFinite(startMs) && now >= startMs + args.graceMins * 60000;
  const ended = Number.isFinite(now) && Number.isFinite(endMs) && now >= endMs;
  if (!started) return args.assigned >= args.headcount ? 'green' : 'yellow';
  if (ended) return args.assigned >= args.headcount ? 'green' : 'red';
  if (args.assigned < args.headcount) return 'red';
  return args.presentNow >= args.headcount ? 'green' : 'orange';
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
