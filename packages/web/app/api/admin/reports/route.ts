import ExcelJS from 'exceljs';
import { requireAdmin } from '../../../../lib/session';
import { getGateway } from '../../../../lib/sheets';
import {
  listAttendance,
  listWorkers,
  listInstances,
  listTemplates,
  listPlaces,
  listAdjustments,
  listAssignments,
  computePay,
  resolveAssignmentRate,
  hoursByEmployee,
  hoursByLocation,
  attendanceExceptions,
  writeReportTab,
  filterAttendanceForReport,
  reportByObject,
  reportByPerson,
  reportSummary,
  type WorkedItem,
  type ReportSheet,
} from '@scourage/worklog-core';

export const runtime = 'nodejs';

const VALID_TYPES = [
  'hours_employee',
  'hours_location',
  'payroll',
  'exceptions',
  'report_by_object',
  'report_by_person',
  'report_summary',
] as const;
type ReportType = (typeof VALID_TYPES)[number];

async function workbookResponse(sheets: ReportSheet[], from: string, to: string): Promise<Response> {
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  for (const s of sheets) {
    // Excel sheet names: <=31 chars, no []:*?/\ — sanitize + de-dupe.
    let name = (s.name || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Sheet';
    let n = name, i = 2;
    while (used.has(n)) { const suffix = ` (${i++})`; n = name.slice(0, 31 - suffix.length) + suffix; }
    used.add(n);
    const ws = wb.addWorksheet(n);
    ws.addRow([s.title]);                 // title cell
    ws.addRow(s.header);
    for (const r of s.rows) ws.addRow(r);
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="report ${from}..${to}.xlsx"`,
    },
  });
}

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
  const location = typeof b.location === 'string' ? b.location : '';
  const employeePhone = typeof b.employeePhone === 'string' ? b.employeePhone : '';
  const locations = Array.isArray(b.locations)
    ? b.locations.filter((x): x is string => typeof x === 'string')
    : (typeof b.location === 'string' && b.location ? [b.location] : []);
  const employeePhones = Array.isArray(b.employeePhones)
    ? b.employeePhones.filter((x): x is string => typeof x === 'string')
    : (typeof b.employeePhone === 'string' && b.employeePhone ? [b.employeePhone] : []);

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

    const filteredAtt = filterAttendanceForReport(att, instLocById, { location: locations, employeePhone: employeePhones });

    if (type === 'report_by_object' || type === 'report_by_person' || type === 'report_summary') {
      const places = await listPlaces(gw);
      const rateByLocation = new Map(places.map((p) => [p.name, p.baseRate]));

      if (type === 'report_by_object') {
        return workbookResponse(reportByObject(filteredAtt, instById, nameByPhone, { from, to }), from, to);
      } else if (type === 'report_by_person') {
        return workbookResponse(reportByPerson(filteredAtt, instById, nameByPhone, { from, to }), from, to);
      } else {
        return workbookResponse([reportSummary(filteredAtt, instById, rateByLocation, { from, to })], from, to);
      }
    }

    let header: string[];
    let rows: string[][];

    if (type === 'hours_employee') {
      header = ['Worker', 'Hours'];
      rows = hoursByEmployee(filteredAtt, { from, to }).map(({ employeePhone, hours }) => [
        nameByPhone.get(employeePhone) ?? employeePhone,
        String(hours),
      ]);
    } else if (type === 'hours_location') {
      header = ['Location', 'Hours'];
      rows = hoursByLocation(filteredAtt, instLocById, { from, to }).map(({ location, hours }) => [
        location,
        String(hours),
      ]);
    } else if (type === 'exceptions') {
      header = ['Worker', 'Date', 'Location', 'Issue'];
      rows = attendanceExceptions(filteredAtt, instById, { from, to }).map(
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
      const [templates, places, assignments] = await Promise.all([
        listTemplates(gw),
        listPlaces(gw),
        listAssignments(gw),
      ]);

      const instanceMap = new Map(
        instances.map((inst) => [
          inst.id,
          { templateId: inst.templateId, location: inst.location },
        ])
      );

      const assignmentRateByKey = new Map(
        assignments.map((a) => [`${a.instanceId}|${a.employeePhone}`, a.rate])
      );

      const activeWorkers = workers.filter((w) => w.active && (!employeePhone || w.phone === employeePhone));
      rows = await Promise.all(
        activeWorkers.map(async (w) => {
          const adjustments = await listAdjustments(gw, { employeePhone: w.phone, from, to });

          const workerAtt = filteredAtt.filter(
            (a) =>
              a.employeePhone === w.phone &&
              (a.status === 'closed' || a.status === 'corrected')
          );

          const items: WorkedItem[] = workerAtt.map((a) => {
            const inst = instanceMap.get(a.instanceId);
            const tmpl = inst ? templates.find((t) => t.id === inst.templateId) : undefined;
            const place = inst ? places.find((p) => p.name === inst.location) : undefined;
            const assignmentRate = assignmentRateByKey.get(`${a.instanceId}|${w.phone}`) ?? '';
            const rate = resolveAssignmentRate(
              assignmentRate,
              w.payRate ?? '',
              tmpl?.rate ?? '',
              place?.baseRate ?? ''
            );
            return { date: a.date, hours: Number(a.hours) || 0, rate };
          });

          const breakdown = computePay(
            'hourly',
            Number(w.payRate) || 0,
            items,
            adjustments
          );

          const totalHours = items.reduce((s, i) => s + i.hours, 0);

          return [
            w.name,
            'hourly',
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
