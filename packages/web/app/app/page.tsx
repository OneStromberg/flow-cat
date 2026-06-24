import { redirect } from 'next/navigation';
import { requireWorker } from '../../lib/session';
import { getGateway, COMPANY_TZ } from '../../lib/sheets';
import { loadQuestions, validateQuestions, listWorkerEntries, todayISO } from '@scourage/worklog-core';
import { questionToWidget } from '../../lib/form-widgets';
import { EntryForm } from './entry-form';
import { LogoutButton } from './logout-button';
import { TelegramConnect } from '../components/telegram-connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AppPage() {
  const worker = await requireWorker();
  if (!worker || !worker.active) redirect('/login');

  const gw = getGateway();
  const questions = await loadQuestions(gw);
  const valid = validateQuestions(questions);
  const entries = await listWorkerEntries(gw, worker.phone);
  const totalHours = entries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);

  const fieldKeys = questions.map((q) => q.key);

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{worker.greeting || `Hi ${worker.name}!`}</h1>
        <LogoutButton />
      </div>
      <TelegramConnect phone={worker.phone} linked={!!worker.telegramChatId} />

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">New entry</h2>
        {valid.ok && worker.places.length > 0 ? (
          <div className="mt-3">
            <EntryForm widgets={questions.map((q) => questionToWidget(q, worker))} today={todayISO(COMPANY_TZ)} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-600">
            {worker.places.length === 0 ? 'No work sites assigned yet — ask your manager.' : 'Not set up yet — ask your manager.'}
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          My hours {totalHours > 0 && <span className="text-gray-400">· {Math.round(totalHours * 100) / 100}h total</span>}
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
    </main>
  );
}
