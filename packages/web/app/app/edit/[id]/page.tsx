import { redirect } from 'next/navigation';
import { requireWorker } from '../../../../lib/session';
import { getRequestGateway, COMPANY_TZ } from '../../../../lib/sheets';
import { loadQuestions, validateQuestions, getEntry, todayISO, normalizePhone } from '@scourage/worklog-core';
import { questionToWidget } from '../../../../lib/form-widgets';
import { t, resolveLang } from '../../../../lib/i18n/strings';
import { EditForm } from './edit-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const worker = await requireWorker();
  if (!worker || !worker.active) redirect('/login');
  const { id } = await params;
  const lang = resolveLang(worker.lang);

  const gw = getRequestGateway();
  const entry = await getEntry(gw, id);
  if (!entry || normalizePhone(entry.phone) !== normalizePhone(worker.phone) || entry.locked || !entry.id) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <p className="text-gray-600">This entry can't be edited.</p>
        <a className="mt-3 inline-block text-blue-600 underline" href="/app">Back</a>
      </main>
    );
  }

  const questions = await loadQuestions(gw);
  const valid = validateQuestions(questions);
  if (!valid.ok) redirect('/app');

  const widgets = questions.map((q) => questionToWidget(q, worker));
  const initial: Record<string, string> = {};
  for (const q of questions) initial[q.key] = entry.values[q.key] ?? '';

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="text-xl font-semibold">{t('edit.title', lang)}</h1>
      <div className="mt-6">
        <EditForm id={entry.id} widgets={widgets} initial={initial} today={todayISO(COMPANY_TZ)} lang={lang} />
      </div>
    </main>
  );
}
