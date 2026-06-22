export function parseClockTime(s: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

export function computeHours(
  start: { h: number; m: number },
  end: { h: number; m: number },
): number | null {
  let mins = (end.h * 60 + end.m) - (start.h * 60 + start.m);
  if (mins < 0) mins += 24 * 60; // finish earlier than start → overnight (next day)
  if (mins === 0) return null; // identical start/finish → no shift
  return Math.round((mins / 60) * 100) / 100;
}
