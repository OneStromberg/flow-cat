import { getGateway, COMPANY_TZ } from '../../../lib/sheets';
import { requireWorker } from '../../../lib/session';
import {
  listAssignments,
  listInstances,
  listPlaces,
  distanceMeters,
  withinGeofence,
  checkIn,
  checkOut,
  todayISO,
} from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const worker = await requireWorker();
  if (!worker || !worker.active) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const instanceId = String(raw.instanceId ?? '').trim();
  const action = String(raw.action ?? '').trim() as 'in' | 'out';
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);

  if (!instanceId || (action !== 'in' && action !== 'out')) {
    return Response.json({ error: 'instanceId and action (in|out) are required' }, { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: 'lat and lng must be numbers' }, { status: 400 });
  }

  try {
    const gw = getGateway();

    // Authorization: confirm session worker has an active assignment for this instance
    const assignments = await listAssignments(gw, { instanceId });
    const assigned = assignments.some((a) => a.employeePhone === worker.phone);
    if (!assigned) {
      return Response.json({ error: 'not assigned to this shift' }, { status: 403 });
    }

    // Load today's instances to find the one we need
    const today = todayISO(COMPANY_TZ);
    const instances = await listInstances(gw, { from: today, to: today });
    const instance = instances.find((i) => i.id === instanceId);
    if (!instance) {
      return Response.json({ error: 'shift instance not found for today' }, { status: 404 });
    }

    // Find the place for geofence computation
    const places = await listPlaces(gw);
    const place = places.find((p) => p.name === instance.location);

    let inGeofence = false;
    if (place && place.lat && place.lng) {
      const placeLat = Number(place.lat);
      const placeLng = Number(place.lng);
      const radiusM = Number(place.geofenceRadiusM) || 100;
      if (Number.isFinite(placeLat) && Number.isFinite(placeLng)) {
        inGeofence = withinGeofence(distanceMeters(lat, lng, placeLat, placeLng), radiusM);
      }
    }

    const at = new Date().toISOString();

    if (action === 'in') {
      const result = await checkIn(gw, {
        instanceId,
        employeePhone: worker.phone,
        at,
        lat: String(lat),
        lng: String(lng),
        photo: '',
        inGeofence,
      });
      if (!result.ok) {
        return Response.json({ error: result.error }, { status: 409 });
      }
      return Response.json({ ok: true, inGeofence });
    } else {
      const result = await checkOut(gw, {
        instanceId,
        employeePhone: worker.phone,
        at,
        lat: String(lat),
        lng: String(lng),
        photo: '',
        inGeofence,
      });
      if (!result.ok) {
        return Response.json({ error: result.error }, { status: 409 });
      }
      return Response.json({ ok: true, hours: result.hours, inGeofence });
    }
  } catch (err) {
    console.error('checkin failed:', err);
    return Response.json({ error: 'server error' }, { status: 503 });
  }
}
