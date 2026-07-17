import { redirect } from 'next/navigation';
import { requireWorker } from '../../../lib/session';
import { getRequestGateway, COMPANY_TZ } from '../../../lib/sheets';
import {
  loadQuestions,
  validateQuestions,
  listWorkerEntries,
  todayISO,
  listAttendance,
  listInstances,
  type Attendance,
} from '@scourage/worklog-core';
import { questionToWidget } from '../../../lib/form-widgets';
import { EntryForm } from '../entry-form';
import { t, resolveLang } from '../../../lib/i18n/strings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return iso;
  }
}

export default async function HoursPage() {
  const worker = await requireWorker();
  if (!worker || !worker.active) redirect('/login');
  const lang = resolveLang(worker.lang);

  const gw = getRequestGateway();

  // Load manual entries
  const questions = await loadQuestions(gw);
  const valid = validateQuestions(questions);
  const entries = await listWorkerEntries(gw, worker.phone);
  const totalHours = entries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);
  const fieldKeys = questions.map((q) => q.key);

  // Load attendance records
  const attendanceRecords = await listAttendance(gw, { employeePhone: worker.phone });
  const instances = await listInstances(gw, { from: '0000-01-01', to: '9999-12-31' });
  const instanceMap = new Map(instances.map((i) => [i.id, i.location]));

  const closedAttendance = attendanceRecords
    .filter((a) => a.status === 'closed' || a.status === 'corrected')
    .sort((a, b) => b.date.localeCompare(a.date) || b.checkInAt.localeCompare(a.checkInAt));

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="text-xl font-semibold">{t('hours.title', lang)}</h1>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">New entry</h2>
        {valid.ok && worker.places.length > 0 ? (
          <div className="mt-3">
            <EntryForm widgets={questions.map((q) => questionToWidget(q, worker))} today={todayISO(COMPANY_TZ)} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-600">
            {worker.places.length === 0
              ? 'No work sites assigned yet — ask your manager.'
              : 'Not set up yet — ask your manager.'}
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          My hours{totalHours > 0 && <span className="text-gray-400"> · {Math.round(totalHours * 100) / 100}h {t('hours.total', lang)}</span>}
        </h2>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No entries yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200">
            {entries.map((e) => (
              <li key={e.id || e.rowNumber} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <div className="font-medium">{fieldKeys.map((k) => e.values[k]).filter(Boolean).join(' · ')}</div>
                  {e.hours && <div className="text-gray-500">{e.hours}h</div>}
                </div>
                {e.locked || !e.id ? (
                  <span className="text-gray-400">🔒</span>
                ) : (
                  <a className="text-blue-600 underline" href={`/app/edit/${e.id}`}>Edit</a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t('hours.attended', lang)}</h2>
        {closedAttendance.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">{t('hours.noAttended', lang)}</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200">
            {closedAttendance.map((a: Attendance) => {
              const location = instanceMap.get(a.instanceId) || '—';
              return (
                <li key={a.id} className="p-3 text-sm">
                  <div className="font-medium">
                    {a.date} · {location}
                  </div>
                  <div className="text-gray-500">
                    {fmtTime(a.checkInAt)} → {fmtTime(a.checkOutAt)} · {a.hours}h
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
