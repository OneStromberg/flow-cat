import { getGateway, COMPANY_TZ } from '../../../lib/sheets';
import { requireWorker } from '../../../lib/session';
import { storeCheckinPhoto } from '../../../lib/gcs';
import {
  listAssignments,
  listInstances,
  listPlaces,
  listWorkers,
  distanceMeters,
  withinGeofence,
  checkIn,
  checkOut,
  todayISO,
  localWallClockToUTC,
} from '@scourage/worklog-core';
import { notifyAdmins, pickAdminChatIds } from '../../../lib/telegram';

export const runtime = 'nodejs';

function hhmm(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

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
  const photo = typeof raw.photo === 'string' ? raw.photo : undefined;

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

    // Hard-block a geofence-failing check-in BEFORE uploading any photo
    if (action === 'in' && place && place.lat && place.lng && inGeofence === false) {
      return Response.json({ error: 'outside_geofence', message: `You are outside ${instance.location}'s allowed area. Move closer, or ask your manager to widen the radius.` }, { status: 422 });
    }

    const at = new Date().toISOString();
    const photoUrl = await storeCheckinPhoto(
      photo,
      `${instanceId}_${worker.phone}`,
      action,
    );

    if (action === 'in') {
      const result = await checkIn(gw, {
        instanceId,
        employeePhone: worker.phone,
        at,
        lat: String(lat),
        lng: String(lng),
        photo: photoUrl,
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
        photo: photoUrl,
        inGeofence,
      });
      if (!result.ok) {
        return Response.json({ error: result.error }, { status: 409 });
      }
      // Early-checkout alert: notify admins if worker leaves before scheduled shift end.
      const [y, m, d] = instance.date.split('-').map(Number);
      const endDate = instance.end < instance.start
        ? new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
        : instance.date;
      const endMs = Date.parse(localWallClockToUTC(endDate, instance.end, COMPANY_TZ));
      if (Date.parse(at) < endMs) {
        try {
          const admins = pickAdminChatIds(await listWorkers(gw));
          await notifyAdmins(`⚠️ ${worker.name} checked out early at ${instance.location} (${hhmm(at, COMPANY_TZ)}, shift ends ${instance.end}) — 📞 ${worker.phone}`, admins);
        } catch (e) { console.error('early-checkout alert failed:', e); }
      }
      return Response.json({ ok: true, hours: result.hours, inGeofence });
    }
  } catch (err) {
    console.error('checkin failed:', err);
    return Response.json({ error: 'server error' }, { status: 503 });
  }
}
