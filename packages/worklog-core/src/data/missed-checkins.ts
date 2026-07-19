import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';
import { localWallClockToUTC } from '../time/dates';
import { listPlaces, placeGraceMins } from './places';

export interface MissedEvent {
  instanceId: string;
  employeePhone: string;
  type: 'in' | 'out' | 'offsite';
  location: string;
  expectedAt: string;
}

const ALERTS_COLUMNS = ['instance_id', 'employee_phone', 'type', 'sent_at'];

// ── Date helpers ───────────────────────────────────────────────────────────────

function startMs(date: string, start: string, tz: string): number {
  return Date.parse(localWallClockToUTC(date, start, tz));
}

function endMs(date: string, start: string, end: string, tz: string): number {
  const useNextDay = end < start;
  const [y, m, d] = date.split('-').map(Number);
  const endDate = useNextDay
    ? new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
    : date;
  return Date.parse(localWallClockToUTC(endDate, end, tz));
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function findMissedCheckins(
  gateway: SheetsGateway,
  nowISO: string,
  defaultGraceMins = 10,
  tz = 'UTC',
  checkoutGraceMins = 15,
): Promise<MissedEvent[]> {
  const now = Date.parse(nowISO);

  const [instanceObjs, assignObjs, attObjs, places] = await Promise.all([
    rowsToObjects(await gateway.readTab('ShiftInstances')),
    rowsToObjects(await gateway.readTab('ShiftAssignments')),
    rowsToObjects(await gateway.readTab('Attendance')),
    listPlaces(gateway),
  ]);

  const placeByName = new Map(places.map((p) => [p.name, p]));

  // Index instances by id (skip cancelled)
  const instanceById = new Map<string, Record<string, string>>();
  for (const o of instanceObjs) {
    const id = (o.id ?? '').trim();
    if (id && (o.status ?? '').trim() !== 'cancelled') instanceById.set(id, o);
  }

  // Only assigned assignments
  const assignments = assignObjs.filter(
    (o) => (o.status ?? '').trim() === 'assigned',
  );

  // Index attendance by "instanceId|phone" → array of records
  const attByKey = new Map<string, Record<string, string>[]>();
  for (const o of attObjs) {
    const iid = (o.instance_id ?? '').trim();
    const phone = (o.employee_phone ?? '').trim();
    if (!iid || !phone) continue;
    const key = `${iid}|${phone}`;
    const arr = attByKey.get(key) ?? [];
    arr.push(o);
    attByKey.set(key, arr);
  }

  const missed: MissedEvent[] = [];

  for (const asgn of assignments) {
    const instanceId = (asgn.instance_id ?? '').trim();
    const phone = (asgn.employee_phone ?? '').trim();
    if (!instanceId || !phone) continue;

    const inst = instanceById.get(instanceId);
    if (!inst) continue;

    const date = (inst.date ?? '').trim();
    const start = (inst.start ?? '').trim();
    const end = (inst.end ?? '').trim();
    const location = (inst.location ?? '').trim();
    if (!date || !start || !end) continue;

    const grace = placeGraceMins(placeByName.get(location), defaultGraceMins) * 60000;
    const key = `${instanceId}|${phone}`;
    const attRecords = attByKey.get(key) ?? [];

    // Missed check-in: grace passed and no attendance record at all
    const inStart = startMs(date, start, tz);
    if (now > inStart + grace && attRecords.length === 0) {
      missed.push({
        instanceId,
        employeePhone: phone,
        type: 'in',
        location,
        expectedAt: new Date(inStart).toISOString(),
      });
    }

    // Missed check-out: fixed grace after end passed and has an open attendance record
    const inEnd = endMs(date, start, end, tz);
    if (now > inEnd + checkoutGraceMins * 60000) {
      const openRecord = attRecords.find((a) => (a.status ?? '').trim() === 'open');
      if (openRecord) {
        missed.push({
          instanceId,
          employeePhone: phone,
          type: 'out',
          location,
          expectedAt: new Date(inEnd).toISOString(),
        });
      }
    }
  }

  return missed;
}

export async function listSentAlerts(gateway: SheetsGateway): Promise<Set<string>> {
  const objs = rowsToObjects(await gateway.readTab('Alerts'));
  const result = new Set<string>();
  for (const o of objs) {
    const iid = (o.instance_id ?? '').trim();
    const phone = (o.employee_phone ?? '').trim();
    const type = (o.type ?? '').trim();
    if (iid && phone && type) result.add(`${iid}|${phone}|${type}`);
  }
  return result;
}

export async function recordAlerts(
  gateway: SheetsGateway,
  events: MissedEvent[],
): Promise<void> {
  if (events.length === 0) return;

  const rows = await gateway.readTab('Alerts');
  const header =
    rows[0] && rows[0].length
      ? rows[0].map((h) => h.trim())
      : ALERTS_COLUMNS;

  const sentAt = new Date().toISOString();
  for (const ev of events) {
    const record: Record<string, string> = {
      instance_id: ev.instanceId,
      employee_phone: ev.employeePhone,
      type: ev.type,
      sent_at: sentAt,
    };
    await gateway.appendRow('Alerts', objectToRow(record, header));
  }
}

export async function lastAlertAtByKey(
  gateway: SheetsGateway,
): Promise<Map<string, string>> {
  const objs = rowsToObjects(await gateway.readTab('Alerts'));
  const m = new Map<string, string>();
  for (const o of objs) {
    const key = `${(o.instance_id ?? '').trim()}|${(o.employee_phone ?? '').trim()}|${(o.type ?? '').trim()}`;
    const sent = (o.sent_at ?? '').trim();
    if (!sent) continue;
    const prev = m.get(key);
    if (!prev || sent > prev) m.set(key, sent);
  }
  return m;
}

export function shouldRealert(
  lastSentIso: string | undefined,
  nowIso: string,
  minGapMs: number,
): boolean {
  if (!lastSentIso) return true;
  const last = Date.parse(lastSentIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(last) || !Number.isFinite(now)) return true;
  return now - last >= minGapMs;
}
