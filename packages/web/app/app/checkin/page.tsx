import { redirect } from 'next/navigation';
import { requireWorker } from '../../../lib/session';
import { getRequestGateway, COMPANY_TZ } from '../../../lib/sheets';
import {
  listInstances,
  listAssignments,
  listAttendance,
  listTemplates,
  todayISO,
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
}

export default async function CheckinPage() {
  const worker = await requireWorker();
  if (!worker || !worker.active) redirect('/login');
  const lang = resolveLang(worker.lang);

  const gw = getRequestGateway();
  const today = todayISO(COMPANY_TZ);

  // Load all today's instances, templates, and this worker's active assignments + attendance
  const [todayInstances, templates, workerAssignments, workerAttendance] = await Promise.all([
    listInstances(gw, { from: today, to: today }),
    listTemplates(gw),
    listAssignments(gw, { employeePhone: worker.phone }),
    listAttendance(gw, { employeePhone: worker.phone }),
  ]);

  const templateMap = new Map(templates.map((t) => [t.id, t]));

  // Filter instances assigned to this worker
  const assignedInstanceIds = new Set(workerAssignments.map((a) => a.instanceId));
  const assignedInstances = todayInstances.filter((i) => assignedInstanceIds.has(i.id));

  // Attach attendance + template info per instance
  const items: InstanceWithAttendance[] = assignedInstances.map((instance) => {
    // Find the most relevant attendance record: prefer open, then closed
    const records = workerAttendance.filter((a) => a.instanceId === instance.id);
    const openRecord = records.find((a) => a.status === 'open') ?? null;
    const closedRecord = records.find((a) => a.status === 'closed' || a.status === 'corrected') ?? null;
    const tpl = templateMap.get(instance.templateId);
    return {
      instance,
      attendance: openRecord ?? closedRecord ?? null,
      role: tpl?.label ?? '',
      instructions: tpl?.instructions ?? '',
    };
  });

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
