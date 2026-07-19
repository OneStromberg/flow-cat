import { redirect } from 'next/navigation';
import { requireManagerOrAdmin } from '../../../../lib/session';
import { AddPlaceForm } from './add-place-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AddPlacePage() {
  const admin = await requireManagerOrAdmin();
  if (!admin) redirect('/');
  return (
    <main className="mx-auto max-w-md p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Add place</h1>
        <a href="/admin/places" className="text-sm text-gray-500 underline">Back</a>
      </div>
      <AddPlaceForm />
    </main>
  );
}
