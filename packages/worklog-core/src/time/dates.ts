function isoInTz(d: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function todayISO(tz: string, now: Date = new Date()): string {
  return isoInTz(now, tz);
}

export function yesterdayISO(tz: string, now: Date = new Date()): string {
  return isoInTz(new Date(now.getTime() - 86_400_000), tz);
}

export function resolveTypedDate(
  s: string,
  tz: string,
  now: Date = new Date(),
): { ok: true; iso: string } | { ok: false; reason: 'invalid' | 'future' } {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s ?? '').trim());
  if (!m) return { ok: false, reason: 'invalid' };
  const day = Number(m[1]);
  const mon = Number(m[2]);
  const yr = Number(m[3]);
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return { ok: false, reason: 'invalid' };
  const iso = `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return { ok: false, reason: 'invalid' };
  // round-trip guard catches overflow like 31/02
  if (isoInTz(dt, 'UTC') !== iso) return { ok: false, reason: 'invalid' };
  if (iso > todayISO(tz, now)) return { ok: false, reason: 'future' };
  return { ok: true, iso };
}
