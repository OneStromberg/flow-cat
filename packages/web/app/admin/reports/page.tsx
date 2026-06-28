import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { ReportsClient } from './reports-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  return (
    <main className="mx-auto max-w-4xl p-5">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Reports</h1>
      </div>
      <ReportsClient />
    </main>
  );
}
