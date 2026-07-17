import { redirect } from 'next/navigation';
import { requireWorker } from '../../../lib/session';
import { getRequestGateway, COMPANY_TZ } from '../../../lib/sheets';
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
} from '@scourage/worklog-core';
import { t, resolveLang } from '../../../lib/i18n/strings';
import { CheckinClient } from './checkin-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface InstanceWithAttendance {
  instance: ShiftInstance;
  attendance: Attendance | null;
  role: string;
  instructions: string;
  address: string;
  contact: string;
  wazeUrl: string;
  mapsUrl: string;
}

export default async function CheckinPage() {
  const worker = await requireWorker();
  if (!worker || !worker.active) redirect('/login');
  const lang = resolveLang(worker.lang);

  const gw = getRequestGateway();
  const today = todayISO(COMPANY_TZ);

  // Load all today's instances, templates, places, and this worker's active assignments + attendance
  const [todayInstances, templates, places, workerAssignments, workerAttendance] = await Promise.all([
    listInstances(gw, { from: today, to: today }),
    listTemplates(gw),
    listPlaces(gw),
    listAssignments(gw, { employeePhone: worker.phone }),
    listAttendance(gw, { employeePhone: worker.phone }),
  ]);

  const templateMap = new Map(templates.map((t) => [t.id, t]));
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

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="text-xl font-semibold">{t('checkin.title', lang)}</h1>
      <p className="mt-1 text-sm text-gray-500">{t('checkin.today', lang)} · {today}</p>
      <div className="mt-6">
        <CheckinClient items={items} workerName={worker.name ?? worker.phone} lang={lang} />
      </div>
    </main>
  );
}
