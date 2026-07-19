import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/session';
import { getRequestGateway } from '../../../lib/sheets';
import { listPlaces, listInstances, listAssignments, listWorkers } from '@scourage/worklog-core';
import { MapClient } from './map-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type MarkerStatus = 'staffed' | 'needs' | 'none';

export interface MapMarker {
  name: string;
  lat: number;
  lng: number;
  status: MarkerStatus;
  shifts: { start: string; end: string; assigned: number; headcount: number; workers: string[] }[];
}

export default async function MapPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  const today = new Date().toISOString().slice(0, 10);
  const gw = getRequestGateway();

  const [places, instances, assignments, workers] = await Promise.all([
    listPlaces(gw),
    listInstances(gw, { from: today, to: today }),
    listAssignments(gw, {}),
    listWorkers(gw),
  ]);

  const nameByPhone = new Map(workers.map((w) => [w.phone, w.name]));

  // Count assigned workers per instance (already filtered to status='assigned' by listAssignments)
  const assignedByInstance = new Map<string, number>();
  const namesByInstance = new Map<string, string[]>();
  for (const a of assignments) {
    if (a.status !== 'assigned') continue;
    assignedByInstance.set(a.instanceId, (assignedByInstance.get(a.instanceId) ?? 0) + 1);
    const list = namesByInstance.get(a.instanceId) ?? [];
    list.push(nameByPhone.get(a.employeePhone) ?? a.employeePhone);
    namesByInstance.set(a.instanceId, list);
  }

  const markers: MapMarker[] = [];

  for (const place of places) {
    if (!place.active) continue;
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lng);
    if (!isFinite(lat) || !isFinite(lng)) continue;

    const todayInstances = instances.filter(
      (inst) => inst.location === place.name && inst.status !== 'cancelled',
    );

    let status: MarkerStatus;
    if (todayInstances.length === 0) {
      status = 'none';
    } else if (todayInstances.every((inst) => (assignedByInstance.get(inst.id) ?? 0) >= inst.headcount)) {
      status = 'staffed';
    } else {
      status = 'needs';
    }

    const shifts = todayInstances.map((inst) => ({
      start: inst.start,
      end: inst.end,
      assigned: assignedByInstance.get(inst.id) ?? 0,
      headcount: inst.headcount,
      workers: namesByInstance.get(inst.id) ?? [],
    }));

    markers.push({ name: place.name, lat, lng, status, shifts });
  }

  return (
    <main className="mx-auto max-w-5xl p-5">
      <h1 className="mb-4 text-xl font-semibold">Site Map</h1>
      <MapClient markers={markers} />
    </main>
  );
}
