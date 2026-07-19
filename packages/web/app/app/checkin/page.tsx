import { redirect } from 'next/navigation';
import { requireWorker } from '../../../lib/session';
import { resolveLang } from '../../../lib/i18n/strings';
import { CheckinClient } from './checkin-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CheckinPage() {
  const worker = await requireWorker();
  if (!worker || !worker.active) redirect('/login');
  const lang = resolveLang(worker.lang);

  return <CheckinClient workerName={worker.name ?? worker.phone} lang={lang} />;
}
