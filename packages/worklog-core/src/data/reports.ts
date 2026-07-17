import type { SheetsGateway } from '@scourage/sheets-helper';
import type { Attendance } from './attendance.ts';
import type { ShiftInstance } from './shift-instances.ts';

type Range = { from: string; to: string };

function inRange(date: string, r: Range): boolean {
  return date >= r.from && date <= r.to;
}

function isClosed(att: Attendance): boolean {
  return att.status === 'closed' || att.status === 'corrected';
}

export function hoursByEmployee(att: Attendance[], range: Range): { employeePhone: string; hours: number }[] {
  const map = new Map<string, number>();
  for (const a of att) {
    if (!isClosed(a) || !inRange(a.date, range)) continue;
    map.set(a.employeePhone, (map.get(a.employeePhone) ?? 0) + (Number(a.hours) || 0));
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([employeePhone, hours]) => ({ employeePhone, hours }));
}

export function hoursByLocation(
  att: Attendance[],
  instLocById: Map<string, string>,
  range: Range,
): { location: string; hours: number }[] {
  const map = new Map<string, number>();
  for (const a of att) {
    if (!isClosed(a) || !inRange(a.date, range)) continue;
    const location = instLocById.get(a.instanceId) ?? '—';
    map.set(location, (map.get(location) ?? 0) + (Number(a.hours) || 0));
  }
  return [...map.entries()].map(([location, hours]) => ({ location, hours }));
}

export function attendanceExceptions(
  att: Attendance[],
  instById: Map<string, ShiftInstance>,
  range: Range,
): { employeePhone: string; date: string; location: string; kind: 'late' | 'out_of_zone' }[] {
  const results: { employeePhone: string; date: string; location: string; kind: 'late' | 'out_of_zone' }[] = [];
  for (const a of att) {
    if (!isClosed(a) || !inRange(a.date, range)) continue;
    const inst = instById.get(a.instanceId);
    const location = inst?.location ?? '—';
    if (!a.checkInInGeofence || !a.checkOutInGeofence) {
      results.push({ employeePhone: a.employeePhone, date: a.date, location, kind: 'out_of_zone' });
    }
    if (inst && Date.parse(a.checkInAt) > Date.parse(`${inst.date}T${inst.start}:00Z`) + 15 * 60000) {
      results.push({ employeePhone: a.employeePhone, date: a.date, location, kind: 'late' });
    }
  }
  return results;
}

function matchesAny(value: string, f?: string | string[]): boolean {
  if (f === undefined) return true;
  const arr = Array.isArray(f) ? f : [f];
  if (arr.length === 0) return true;
  return arr.includes(value);
}

export function filterAttendanceForReport(
  att: Attendance[],
  instLocById: Map<string, string>,
  f: { location?: string | string[]; employeePhone?: string | string[] },
): Attendance[] {
  return att.filter((a) =>
    matchesAny(instLocById.get(a.instanceId) ?? '', f.location) &&
    matchesAny(a.employeePhone, f.employeePhone));
}

export type ReportRange = { from: string; to: string };
export type ReportSheet = { name: string; title: string; header: string[]; rows: string[][] };

const OBJECT_HEADER = ['Date', 'Name', 'Start time', 'End time', 'Total'];
const PERSON_HEADER = ['Date', 'Place', 'Start time', 'End time', 'Total'];
const SUMMARY_HEADER = ['Date', 'Place', 'Hours', 'Rate', 'Total amount'];

// blank the date cell on all but the first row of each date (rows must be date-sorted first)
function blankRepeatDates(rows: string[][]): string[][] {
  let prev = '';
  return rows.map((r) => {
    const out = r[0] === prev ? ['', ...r.slice(1)] : r;
    prev = r[0];
    return out;
  });
}

export function reportByObject(
  att: Attendance[], instById: Map<string, ShiftInstance>, nameByPhone: Map<string, string>, range: ReportRange,
): ReportSheet[] {
  const byLoc = new Map<string, { rows: string[][]; totals: Map<string, number>; grand: number }>();
  for (const a of att) {
    if (!isClosed(a) || !inRange(a.date, range)) continue;
    const inst = instById.get(a.instanceId);
    const location = inst?.location ?? '—';
    const name = nameByPhone.get(a.employeePhone) ?? a.employeePhone;
    const hours = Number(a.hours) || 0;
    if (!byLoc.has(location)) byLoc.set(location, { rows: [], totals: new Map(), grand: 0 });
    const g = byLoc.get(location)!;
    g.rows.push([a.date, name, inst?.start ?? '', inst?.end ?? '', String(hours)]);
    g.totals.set(name, (g.totals.get(name) ?? 0) + hours);
    g.grand += hours;
  }
  return [...byLoc.entries()].map(([location, g]) => {
    const body = blankRepeatDates(g.rows.sort((x, y) => x[0].localeCompare(y[0])));
    const totalsBlock = [...g.totals.entries()].map(([name, hours]) => [name, String(hours), '', '', '']);
    return {
      name: location, title: location, header: OBJECT_HEADER,
      rows: [...body, ...totalsBlock, ['Total', String(g.grand), '', '', '']],
    };
  });
}

export function reportByPerson(
  att: Attendance[], instById: Map<string, ShiftInstance>, nameByPhone: Map<string, string>, range: ReportRange,
): ReportSheet[] {
  const byPhone = new Map<string, { rows: string[][]; totals: Map<string, number>; grand: number }>();
  for (const a of att) {
    if (!isClosed(a) || !inRange(a.date, range)) continue;
    const inst = instById.get(a.instanceId);
    const location = inst?.location ?? '—';
    const hours = Number(a.hours) || 0;
    if (!byPhone.has(a.employeePhone)) byPhone.set(a.employeePhone, { rows: [], totals: new Map(), grand: 0 });
    const g = byPhone.get(a.employeePhone)!;
    g.rows.push([a.date, location, inst?.start ?? '', inst?.end ?? '', String(hours)]);
    g.totals.set(location, (g.totals.get(location) ?? 0) + hours);
    g.grand += hours;
  }
  return [...byPhone.entries()].map(([phone, g]) => {
    const name = nameByPhone.get(phone) ?? phone;
    const body = blankRepeatDates(g.rows.sort((x, y) => x[0].localeCompare(y[0])));
    const totalsBlock = [...g.totals.entries()].map(([loc, hours]) => [loc, String(hours), '', '', '']);
    return {
      name, title: name, header: PERSON_HEADER,
      rows: [...body, ...totalsBlock, ['Total', String(g.grand), '', '', '']],
    };
  });
}

export function reportSummary(
  att: Attendance[], instById: Map<string, ShiftInstance>, rateByLocation: Map<string, string>, range: ReportRange,
): ReportSheet {
  // month × place → hours
  const byMonthLoc = new Map<string, Map<string, number>>();
  for (const a of att) {
    if (!isClosed(a) || !inRange(a.date, range)) continue;
    const location = instById.get(a.instanceId)?.location ?? '—';
    const month = a.date.slice(0, 7); // YYYY-MM
    if (!byMonthLoc.has(month)) byMonthLoc.set(month, new Map());
    const m = byMonthLoc.get(month)!;
    m.set(location, (m.get(location) ?? 0) + (Number(a.hours) || 0));
  }
  const rows: string[][] = [];
  const rollup = new Map<string, number>();
  let grand = 0;
  for (const month of [...byMonthLoc.keys()].sort()) {
    for (const [location, hours] of byMonthLoc.get(month)!) {
      const rate = rateByLocation.get(location) ?? '';
      const amount = hours * (Number(rate) || 0);
      rows.push([month, location, String(hours), rate, String(amount)]);
      rollup.set(location, (rollup.get(location) ?? 0) + amount);
      grand += amount;
    }
  }
  for (const [location, amount] of rollup) rows.push([location, '', '', '', String(amount)]);
  rows.push(['Total', '', '', '', String(grand)]);
  return { name: 'Summary', title: 'Client / Selected places', header: SUMMARY_HEADER, rows };
}

export async function writeReportTab(
  gateway: SheetsGateway,
  tab: string,
  header: string[],
  rows: string[][],
): Promise<void> {
  await gateway.writeHeaderRow(tab, header);
  for (const r of rows) await gateway.appendRow(tab, r);
}
