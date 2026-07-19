import { AdminNav } from './admin-nav';
import { requireManagerOrAdmin } from '../../lib/session';
import { resolveLang } from '../../lib/i18n/strings';
import { NotificationsOptin } from '../components/notifications-optin';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const worker = await requireManagerOrAdmin();
  const role = worker?.role ?? 'worker';
  const lang = resolveLang(worker?.lang);
  return (
    <div className="pb-20">
      <div className="px-4 pt-3">
        <NotificationsOptin lang={lang} />
      </div>
      {children}
      <AdminNav role={role} />
    </div>
  );
}
