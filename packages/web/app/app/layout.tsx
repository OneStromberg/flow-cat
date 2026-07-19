import { WorkerNav } from './worker-nav';
import { SwrProvider } from './swr-provider';
import { requireWorker } from '../../lib/session';
import { resolveLang } from '../../lib/i18n/strings';
import { NotificationsOptin } from '../components/notifications-optin';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const worker = await requireWorker();
  const lang = resolveLang(worker?.lang);
  return (
    <div className="pb-20">
      <div className="px-4 pt-3">
        <NotificationsOptin lang={lang} />
      </div>
      <SwrProvider>{children}</SwrProvider>
      <WorkerNav lang={lang} role={worker?.role} />
    </div>
  );
}
