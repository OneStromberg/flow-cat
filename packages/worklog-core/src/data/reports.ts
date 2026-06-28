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

export async function writeReportTab(
  gateway: SheetsGateway,
  tab: string,
  header: string[],
  rows: string[][],
): Promise<void> {
  await gateway.writeHeaderRow(tab, header);
  for (const r of rows) await gateway.appendRow(tab, r);
}
