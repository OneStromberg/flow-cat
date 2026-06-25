import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getRequestGateway } from '../../../lib/sheets';
import {
  listWorkers,
  listTemplates,
  listPlaces,
  listInstances,
  listAttendance,
  listAdjustments,
  computePay,
  resolveHourlyRate,
  type WorkedItem,
} from '@scourage/worklog-core';
import { PayrollClient } from './payroll-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: fmt(first), to: fmt(last) };
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  const params = await searchParams;
  const defaults = currentMonthRange();
  const from = typeof params.from === 'string' ? params.from : defaults.from;
  const to = typeof params.to === 'string' ? params.to : defaults.to;

  const gw = getRequestGateway();
  const [workers, templates, places, instances] = await Promise.all([
    listWorkers(gw),
    listTemplates(gw),
    listPlaces(gw),
    listInstances(gw, { from, to }),
  ]);

  // Build instance lookup: id → {templateId, location}
  const instanceMap = new Map(
    instances.map((inst) => [inst.id, { templateId: inst.templateId, location: inst.location }])
  );

  const activeWorkers = workers.filter((w) => w.active);

  const rows = await Promise.all(
    activeWorkers.map(async (w) => {
      const [attendance, adjustments] = await Promise.all([
        listAttendance(gw, { employeePhone: w.phone, from, to }),
        listAdjustments(gw, { employeePhone: w.phone, from, to }),
      ]);

      const closedRows = attendance.filter(
        (a) => a.status === 'closed' || a.status === 'corrected'
      );

      const items: WorkedItem[] = closedRows.map((att) => {
        const inst = instanceMap.get(att.instanceId);
        const tmpl = inst ? templates.find((t) => t.id === inst.templateId) : undefined;
        const place = inst ? places.find((p) => p.name === inst.location) : undefined;
        const rate = resolveHourlyRate(w.payRate ?? '', tmpl?.rate ?? '', place?.baseRate ?? '');
        return { date: att.date, hours: Number(att.hours) || 0, rate };
      });

      const breakdown = computePay(
        w.payStructure ?? 'hourly',
        Number(w.payRate) || 0,
        items,
        adjustments
      );

      const totalHours = items.reduce((s, i) => s + i.hours, 0);

      return {
        phone: w.phone,
        name: w.name,
        structure: w.payStructure ?? 'hourly',
        hours: totalHours,
        gross: breakdown.gross,
        bonuses: breakdown.bonuses,
        penalties: breakdown.penalties,
        net: breakdown.net,
      };
    })
  );

  return (
    <main className="mx-auto max-w-6xl p-5">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Payroll</h1>
      </div>
      <PayrollClient rows={rows} workers={activeWorkers} from={from} to={to} />
    </main>
  );
}
