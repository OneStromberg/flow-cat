import type { SheetsGateway } from '@scourage/sheets-helper';
import {
  listInstances,
  listAssignments,
  listAttendance,
  listTemplates,
  listPlaces,
  todayISO,
  localWallClockToUTC,
  wazeUrl,
  googleMapsUrl,
  type ShiftInstance,
  type Attendance,
  type Worker,
} from '@scourage/worklog-core';

// NOT imported from `lib/sheets.ts` on purpose — that module is marked
// `server-only`, which throws when loaded outside Next's server-component
// bundler (e.g. this file's own `node --test` unit test). Same constant,
// computed locally so `loadCheckinData` stays plain-Node testable.
const COMPANY_TZ = process.env.COMPANY_TIMEZONE ?? 'UTC';

export interface InstanceWithAttendance {
  instance: ShiftInstance;
  attendance: Attendance | null;
  role: string;
  instructions: string;
  address: string;
  contact: string;
  wazeUrl: string;
  mapsUrl: string;
  selfieStart: boolean;
  selfieEnd: boolean;
}

export interface CheckinData {
  items: InstanceWithAttendance[];
  /** Company-timezone "today" (server-computed) — the header date must not drift to the browser's local date. */
  today: string;
}

/**
 * Loads everything the Checkin screen's shift-list needs, pre-resolved to
 * plain JSON so the client only has to render — no Sheets/Firestore access
 * happens client-side. Does NOT touch the check-in/out action flow, which
 * stays client-side (geolocation + selfie capture + POST /api/checkin).
 */
export async function loadCheckinData(gw: SheetsGateway, worker: Worker): Promise<CheckinData> {
  const today = todayISO(COMPANY_TZ);

  // Load all today's instances, templates, places, and this worker's active assignments + attendance
  const [todayInstances, templates, places, workerAssignments, workerAttendance] = await Promise.all([
    listInstances(gw, { from: today, to: today }),
    listTemplates(gw),
    listPlaces(gw),
    listAssignments(gw, { employeePhone: worker.phone }),
    listAttendance(gw, { employeePhone: worker.phone }),
  ]);

  const templateMap = new Map(templates.map((tpl) => [tpl.id, tpl]));
  const placeByName = new Map(places.map((p) => [p.name, p]));

  // Filter instances assigned to this worker
  const assignedInstanceIds = new Set(workerAssignments.map((a) => a.instanceId));
  const assignedInstances = todayInstances.filter((i) => assignedInstanceIds.has(i.id));

  // Attach attendance + template + place info per instance
  const items: InstanceWithAttendance[] = assignedInstances.map((instance) => {
    // Find the most relevant attendance record: prefer open, then closed
    const records = workerAttendance.filter((a) => a.instanceId === instance.id);
    const openRecord = records.find((a) => a.status === 'open') ?? null;
    const closedRecord = records.find((a) => a.status === 'closed' || a.status === 'corrected') ?? null;
    const tpl = templateMap.get(instance.templateId);
    const place = placeByName.get(instance.location);
    return {
      instance,
      attendance: openRecord ?? closedRecord ?? null,
      role: tpl?.label ?? '',
      instructions: tpl?.instructions ?? '',
      address: place?.address ?? '',
      contact: place?.contact ?? '',
      wazeUrl: place ? wazeUrl(place.lat, place.lng) : '',
      mapsUrl: place ? googleMapsUrl(place.lat, place.lng, place.placeId) : '',
      selfieStart: tpl?.selfieStart ?? false,
      selfieEnd: tpl?.selfieEnd ?? false,
    };
  });

  // Sort: currently-open shift first, then by nearest upcoming start relative to now.
  const now = Date.now();
  const withStartMs = items.map((item) => {
    const startMs = Date.parse(localWallClockToUTC(item.instance.date, item.instance.start, COMPANY_TZ));
    return { item, startMs: Number.isFinite(startMs) ? startMs : Number.POSITIVE_INFINITY };
  });
  withStartMs.sort((a, b) => {
    const aOpen = a.item.attendance?.status === 'open';
    const bOpen = b.item.attendance?.status === 'open';
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return Math.abs(a.startMs - now) - Math.abs(b.startMs - now);
  });
  items.length = 0;
  items.push(...withStartMs.map(({ item }) => item));

  return {
    items,
    today,
  };
}
