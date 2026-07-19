import { WorkerNav } from './worker-nav';
import { InstallButton } from '../components/install-button';
import { requireWorker } from '../../lib/session';
import { resolveLang } from '../../lib/i18n/strings';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const worker = await requireWorker();
  const lang = resolveLang(worker?.lang);
  return (
    <div className="pb-20">
      {children}
      <div className="flex justify-center px-4 pt-3">
        <InstallButton lang={lang} />
      </div>
      <WorkerNav lang={lang} role={worker?.role} />
    </div>
  );
}
