import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '../../../../lib/session';
import { getRequestGateway, COMPANY_TZ } from '../../../../lib/sheets';
import {
  listPlaces,
  listTemplates,
  listInstances,
  listAssignments,
  wazeUrl,
  googleMapsUrl,
  placeGraceMins,
  todayISO,
} from '@scourage/worklog-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PlaceDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const admin = await requireAdmin();
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

  const today = todayISO(COMPANY_TZ);
  const [templates, instances, allAssignments] = await Promise.all([
    listTemplates(gw),
    listInstances(gw, { from: today, to: '2099-12-31', location: place.name }),
    listAssignments(gw, {}),
  ]);

  const placeTemplates = templates.filter((t) => t.location === place.name);

  const instanceIds = new Set(instances.map((i) => i.id));
  const assignedCountMap = new Map<string, number>();
  for (const a of allAssignments) {
    if (a.status === 'assigned' && instanceIds.has(a.instanceId)) {
      assignedCountMap.set(a.instanceId, (assignedCountMap.get(a.instanceId) ?? 0) + 1);
    }
  }

  const hasCoords = place.lat !== '' && place.lng !== '';
  const graceMinsDisplay = place.graceMins ? `${place.graceMins} min` : 'default (10)';

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/admin/places" className="text-sm text-gray-500 hover:text-gray-900 underline">
        ‹ Back to places
      </Link>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{place.name}</h1>
          <Link
            href={`/admin/places/${encodedName}/edit`}
            className="text-sm text-blue-600 underline hover:text-blue-800"
          >
            Edit place
          </Link>
        </div>
        {place.notes && <p className="mt-2 text-sm text-gray-600">{place.notes}</p>}
      </div>

      {/* Details */}
      <div className="mt-6 divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
        {place.address && (
          <Row label="Address" value={place.address} />
        )}
        {place.client && (
          <Row label="Client" value={place.client} />
        )}
        {place.contact && (
          <Row label="Contact" value={place.contact} />
        )}
        <Row label="Geofence radius" value={place.geofenceRadiusM ? `${place.geofenceRadiusM} m` : '100 m'} />
        <Row label="Grace period" value={graceMinsDisplay} />
        {hasCoords && (
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-gray-500">Navigate</span>
            <span className="flex gap-3">
              <a href={wazeUrl(place.lat, place.lng)} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Waze</a>
              <a href={googleMapsUrl(place.lat, place.lng, place.placeId)} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google Maps</a>
            </span>
          </div>
        )}
      </div>

      {/* Templates */}
      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-gray-800">Shift templates</h2>
        {placeTemplates.length === 0 ? (
          <p className="text-sm text-gray-500">No templates for this place.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
            {placeTemplates.map((t) => (
              <li key={t.id} className="px-4 py-3">
                <Link href={`/admin/shifts/templates/${t.id}`} className="text-blue-600 underline hover:text-blue-800">
                  <span className="font-medium">{t.label || t.id}</span>
                  <span className="ml-2 text-gray-500">
                    {t.days.join(', ')} · {t.start}–{t.end} · {t.headcount} hd
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Upcoming instances */}
      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-gray-800">Upcoming shifts</h2>
        {instances.length === 0 ? (
          <p className="text-sm text-gray-500">No upcoming shifts.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
            {instances.map((inst) => {
              const assigned = assignedCountMap.get(inst.id) ?? 0;
              return (
                <li key={inst.id} className="px-4 py-3 text-gray-700">
                  <span className="font-medium">{inst.date}</span>
                  <span className="ml-2 text-gray-500">{inst.start}–{inst.end}</span>
                  <span className="ml-2 text-gray-500">{assigned}/{inst.headcount} assigned</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  );
}
