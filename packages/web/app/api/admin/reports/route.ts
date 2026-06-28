import { requireAdmin } from '../../../../lib/session';
import { getGateway } from '../../../../lib/sheets';
import {
  listAttendance,
  listWorkers,
  listInstances,
  listTemplates,
  listPlaces,
  listAdjustments,
  computePay,
  resolveHourlyRate,
  hoursByEmployee,
  hoursByLocation,
  attendanceExceptions,
  writeReportTab,
  type WorkedItem,
} from '@scourage/worklog-core';

export const runtime = 'nodejs';

const VALID_TYPES = ['hours_employee', 'hours_location', 'payroll', 'exceptions'] as const;
type ReportType = (typeof VALID_TYPES)[number];

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const type = b.type as string;
  const from = typeof b.from === 'string' ? b.from : '';
  const to = typeof b.to === 'string' ? b.to : '';

  if (!(VALID_TYPES as readonly string[]).includes(type)) {
    return Response.json({ error: 'invalid type' }, { status: 400 });
  }
  if (!from || !to) {
    return Response.json({ error: 'from and to are required' }, { status: 400 });
  }

  try {
    const gw = getGateway();
    const [att, workers, instances] = await Promise.all([
      listAttendance(gw, { from, to }),
      listWorkers(gw),
      listInstances(gw, { from, to }),
    ]);

    const nameByPhone = new Map(workers.map((w) => [w.phone, w.name]));
    const instLocById = new Map(instances.map((i) => [i.id, i.location]));
    const instById = new Map(instances.map((i) => [i.id, i]));

    let header: string[];
    let rows: string[][];

    if (type === 'hours_employee') {
      header = ['Worker', 'Hours'];
      rows = hoursByEmployee(att, { from, to }).map(({ employeePhone, hours }) => [
        nameByPhone.get(employeePhone) ?? employeePhone,
        String(hours),
      ]);
    } else if (type === 'hours_location') {
      header = ['Location', 'Hours'];
      rows = hoursByLocation(att, instLocById, { from, to }).map(({ location, hours }) => [
        location,
        String(hours),
      ]);
    } else if (type === 'exceptions') {
      header = ['Worker', 'Date', 'Location', 'Issue'];
      rows = attendanceExceptions(att, instById, { from, to }).map(
        ({ employeePhone, date, location, kind }) => [
          nameByPhone.get(employeePhone) ?? employeePhone,
          date,
          location,
          kind === 'late' ? 'Late' : 'Out of zone',
        ]
      );
    } else {
      // payroll
      header = ['Worker', 'Structure', 'Hours', 'Gross', 'Bonuses', 'Penalties', 'Net'];
      const [templates, places] = await Promise.all([listTemplates(gw), listPlaces(gw)]);

      const instanceMap = new Map(
        instances.map((inst) => [
          inst.id,
          { templateId: inst.templateId, location: inst.location },
        ])
      );

      const activeWorkers = workers.filter((w) => w.active);
      rows = await Promise.all(
        activeWorkers.map(async (w) => {
          const adjustments = await listAdjustments(gw, { employeePhone: w.phone, from, to });

          const workerAtt = att.filter(
            (a) =>
              a.employeePhone === w.phone &&
              (a.status === 'closed' || a.status === 'corrected')
          );

          const items: WorkedItem[] = workerAtt.map((a) => {
            const inst = instanceMap.get(a.instanceId);
            const tmpl = inst ? templates.find((t) => t.id === inst.templateId) : undefined;
            const place = inst ? places.find((p) => p.name === inst.location) : undefined;
            const rate = resolveHourlyRate(
              w.payRate ?? '',
              tmpl?.rate ?? '',
              place?.baseRate ?? ''
            );
            return { date: a.date, hours: Number(a.hours) || 0, rate };
          });

          const breakdown = computePay(
            w.payStructure || 'hourly',
            Number(w.payRate) || 0,
            items,
            adjustments
          );

          const totalHours = items.reduce((s, i) => s + i.hours, 0);

          return [
            w.name,
            w.payStructure || 'hourly',
            String(totalHours),
            String(breakdown.gross),
            String(breakdown.bonuses),
            String(breakdown.penalties),
            String(breakdown.net),
          ];
        })
      );
    }

    const tab = `Report ${type} ${from}..${to}`.slice(0, 90);
    await writeReportTab(gw, tab, header, rows);

    return Response.json({ ok: true, tab, header, rows });
  } catch (err) {
    console.error('reports route error:', err);
    return Response.json({ error: 'failed to generate report' }, { status: 503 });
  }
}
