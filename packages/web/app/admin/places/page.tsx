import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getGateway } from '../../../lib/sheets';
import { listPlaces, wazeUrl, googleMapsUrl } from '@scourage/worklog-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PlacesPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/');
  const places = await listPlaces(getGateway());

  return (
    <main className="mx-auto max-w-3xl p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Places</h1>
        <a href="/admin/places/add" className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white">+ Add place</a>
      </div>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Name</th>
            <th>Client</th>
            <th>Address</th>
            <th>Active</th>
            <th>Navigate</th>
          </tr>
        </thead>
        <tbody>
          {places.map((p) => {
            const hasCoords = p.lat !== '' && p.lng !== '';
            return (
              <tr key={p.name} className="border-b">
                <td className="py-2 font-medium">{p.name}</td>
                <td className="text-gray-600">{p.client || '—'}</td>
                <td className="text-gray-600">{p.address || '—'}</td>
                <td>{p.active ? 'yes' : 'no'}</td>
                <td>
                  {hasCoords ? (
                    <span className="flex gap-3">
                      <a href={wazeUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Waze</a>
                      <a href={googleMapsUrl(p.lat, p.lng, p.placeId)} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google Maps</a>
                    </span>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
          {places.length === 0 && (
            <tr><td colSpan={5} className="py-4 text-gray-500">No places yet.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
