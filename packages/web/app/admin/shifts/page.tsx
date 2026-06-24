import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getGateway } from '../../../lib/sheets';
import { listTemplates, loadActivePlaces } from '@scourage/worklog-core';
import { ShiftsAdmin } from './shifts-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ShiftsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  const gw = getGateway();
  const [templates, places] = await Promise.all([listTemplates(gw), loadActivePlaces(gw)]);

  return (
    <main className="mx-auto max-w-4xl p-5">
      <h1 className="text-xl font-semibold">Shift Templates</h1>
      <ShiftsAdmin templates={templates} places={places} />
    </main>
  );
}
