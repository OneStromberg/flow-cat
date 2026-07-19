import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireManagerOrAdmin } from '../../../../../lib/session';
import { getRequestGateway } from '../../../../../lib/sheets';
import { listPlaces } from '@scourage/worklog-core';
import { EditPlaceForm } from './edit-place-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EditPlacePage({ params }: { params: Promise<{ name: string }> }) {
  const admin = await requireManagerOrAdmin();
  if (!admin) redirect('/');

  const { name: encodedName } = await params;
  const decoded = decodeURIComponent(encodedName);
  const gw = getRequestGateway();
  const places = await listPlaces(gw);
  const place = places.find((p) => p.name === decoded);

  if (!place) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <p className="text-gray-600">Place not found.</p>
        <Link href="/admin/places" className="mt-4 inline-block text-sm text-blue-600 underline">
          ‹ Back to places
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link
        href={`/admin/places/${encodedName}`}
        className="text-sm text-gray-500 hover:text-gray-900 underline"
      >
        ‹ Back to {decoded}
      </Link>
      <div className="mt-6">
        <h1 className="text-2xl font-bold text-gray-900">Edit place</h1>
      </div>
      <EditPlaceForm place={place} />
    </main>
  );
}
