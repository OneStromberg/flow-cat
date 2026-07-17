import { WorkerNav } from './worker-nav';
import { requireWorker } from '../../lib/session';
import { resolveLang } from '../../lib/i18n/strings';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const worker = await requireWorker();
  const lang = resolveLang(worker?.lang);
  return (
    <div className="pb-20">
      {children}
      <WorkerNav lang={lang} />
    </div>
  );
}
