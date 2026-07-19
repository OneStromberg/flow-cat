import { AdminNav } from './admin-nav';
import { requireManagerOrAdmin } from '../../lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const worker = await requireManagerOrAdmin();
  const role = worker?.role ?? 'worker';
  return (
    <div className="pb-20">
      {children}
      <AdminNav role={role} />
    </div>
  );
}
