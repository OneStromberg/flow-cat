import { getGateway, COMPANY_TZ } from '../../../lib/sheets';
import { findWorkerByToken, loadQuestions, validateQuestions, todayISO } from '@scourage/worklog-core';
import { questionToWidget } from '../../../lib/form-widgets';
import { WorkerForm } from './worker-form';

export const dynamic = 'force-dynamic';

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-gray-600">{body}</p>
    </main>
  );
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gw = getGateway();

  const worker = await findWorkerByToken(gw, token);
  if (!worker || !worker.active) {
    return <Notice title="This link isn't valid" body="Please ask your manager for your link." />;
  }

  const questions = await loadQuestions(gw);
  const valid = validateQuestions(questions);
  if (!valid.ok) {
    return <Notice title="Not set up yet" body="Please ask your manager." />;
  }
  if (worker.places.length === 0) {
    return <Notice title="No work sites assigned" body="Please ask your manager." />;
  }

  const widgets = questions.map((q) => questionToWidget(q, worker));
  const greeting = worker.greeting || `Hi ${worker.name}!`;
  return <WorkerForm token={token} greeting={greeting} widgets={widgets} today={todayISO(COMPANY_TZ)} />;
}
