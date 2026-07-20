import { getGateway, COMPANY_TZ } from '../../../../lib/sheets';
import { requireWorker } from '../../../../lib/session';
import {
  listAttendance,
  listInstances,
  listPlaces,
  listWorkers,
  distanceMeters,
  withinGeofence,
  todayISO,
  recordAlerts,
} from '@scourage/worklog-core';
import { notifyRecipients } from '../../../../lib/push';
import { tf } from '../../../../lib/i18n/strings';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const worker = await requireWorker();
  if (!worker || !worker.active) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const instanceId = String(raw.instanceId ?? '').trim();
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);

  if (!instanceId) {
    return Response.json({ error: 'instanceId is required' }, { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: 'lat and lng must be numbers' }, { status: 400 });
  }

  try {
    const gw = getGateway();

    // Short-circuit: only monitor workers with an open attendance record for this instance
    const att = await listAttendance(gw, { instanceId, employeePhone: worker.phone });
    const open = att.find((a) => a.status === 'open');
    if (!open) {
      return Response.json({ ok: true, inZone: true, nextPollMs: 1_800_000 });
    }

    // Find the instance
    const today = todayISO(COMPANY_TZ);
    const inst = (await listInstances(gw, { from: today, to: today })).find(
      (i) => i.id === instanceId,
    );
    if (!inst) {
      return Response.json({ ok: true, inZone: true, nextPollMs: 1_800_000 });
    }

    // Determine whether the worker is within the geofence
    const places = await listPlaces(gw);
    const place = places.find((p) => p.name === inst.location);

    let inZone = true;
    if (place?.lat && place?.lng) {
      const placeLat = Number(place.lat);
      const placeLng = Number(place.lng);
      if (Number.isFinite(placeLat) && Number.isFinite(placeLng)) {
        const radiusM = Number(place.geofenceRadiusM) || 100;
        inZone = withinGeofence(distanceMeters(lat, lng, placeLat, placeLng), radiusM);
      }
    }
    // If place has no coordinates we cannot enforce — treat as in-zone

    if (!inZone) {
      // Race-free deduped alert: exactly one winner per 15-minute window per (instance, worker)
      try {
        const key = `${instanceId}|${worker.phone}|offsite`;
        const nowIso = new Date().toISOString();
        if (await gw.tryClaim(key, 15 * 60_000)) {
          const admins = (await listWorkers(gw)).filter((w) => w.admin);
          await notifyRecipients(
            gw,
            admins,
            (lang) => tf('alert.offsite', lang, {
              name: worker.name,
              location: inst.location,
              phone: worker.phone,
            }),
            { url: '/admin/attendance' },
          );
          await recordAlerts(gw, [
            {
              instanceId,
              employeePhone: worker.phone,
              type: 'offsite',
              location: inst.location,
              expectedAt: nowIso,
            },
          ]); // keep for audit trail
        }
      } catch (e) {
        console.error('geo ping offsite alert failed:', e);
      }
    }

    return Response.json({ ok: true, inZone, nextPollMs: inZone ? 1_800_000 : 300_000 });
  } catch (err) {
    console.error('geo ping failed:', err);
    // Never break the client's poll loop
    return Response.json({ ok: true, inZone: true, nextPollMs: 1_800_000 });
  }
}
