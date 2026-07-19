import { getGateway, COMPANY_TZ } from '../../../lib/sheets';
import { requireWorker } from '../../../lib/session';
import { storeCheckinPhoto } from '../../../lib/gcs';
import {
  listAssignments,
  listAttendance,
  listInstances,
  listPlaces,
  listTemplates,
  listWorkers,
  distanceMeters,
  withinGeofence,
  checkIn,
  checkOut,
  todayISO,
  localWallClockToUTC,
  toE164,
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

    // Hard-block a geofence-failing check-out, mirroring the check-in guard above
    if (action === 'out' && place && place.lat && place.lng && inGeofence === false) {
      return Response.json(
        { error: 'outside_geofence', message: `You are outside ${instance.location}'s allowed area. Move closer to end your shift, or ask your manager to widen the radius.` },
        { status: 422 },
      );
    }

    // Hard-block a required-but-missing selfie BEFORE any attendance is recorded, mirroring
    // the geofence guards above. The client capture-on-demand is UX only — this is the real
    // enforcement, since a crafted request could omit `photo` entirely.
    const templates = await listTemplates(gw);
    const template = templates.find((tpl) => tpl.id === instance.templateId);
    const selfieRequired = action === 'in' ? !!template?.selfieStart : !!template?.selfieEnd;
    if (selfieRequired && !(typeof photo === 'string' && photo.trim())) {
      return Response.json(
        { error: 'selfie_required', message: `A selfie is required to ${action === 'in' ? 'check in' : 'check out'} at ${instance.location}.` },
        { status: 422 },
      );
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
      // RULE 3: Early check-in alert (>15 min before scheduled start)
      try {
        const startMs = Date.parse(localWallClockToUTC(instance.date, instance.start, COMPANY_TZ));
        if (Number.isFinite(startMs) && startMs - Date.parse(at) > 15 * 60000) {
          const admins = pickAdminChatIds(await listWorkers(gw));
          await notifyAdmins(`⏱ Early check-in\n📍 ${instance.location}\n👤 ${worker.name}\n🕐 ${hhmm(at, COMPANY_TZ)} (starts ${instance.start})\n📞 ${toE164(worker.phone)}`, admins);
        }
      } catch (e) { console.error('early-checkin alert failed:', e); }
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
      // Compute endMs for early-checkout detection (overnight rule applied)
      const [y, m, d] = instance.date.split('-').map(Number);
      const endDate = instance.end < instance.start
        ? new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
        : instance.date;
      const endMs = Date.parse(localWallClockToUTC(endDate, instance.end, COMPANY_TZ));

      // Fetch admins once — shared by all alert blocks below (best-effort)
      let admins: string[] = [];
      try { admins = pickAdminChatIds(await listWorkers(gw)); } catch { /* no admins available */ }

      // RULE 2: Early-checkout alert (>15 min before scheduled end)
      if (Number.isFinite(endMs) && endMs - Date.parse(at) > 15 * 60000) {
        try {
          await notifyAdmins(`⚠️ Early check-out\n📍 ${instance.location}\n👤 ${worker.name}\n🕐 ${hhmm(at, COMPANY_TZ)} (shift ends ${instance.end})\n📞 ${toE164(worker.phone)}`, admins);
        } catch (e) { console.error('early-checkout alert failed:', e); }
      }

      // RULE 4: Short shift alert (<10 min)
      try {
        const mins = Math.round(Number(result.hours) * 60);
        if (Number.isFinite(mins) && mins < 10) {
          await notifyAdmins(`⚠️ Very short shift\n📍 ${instance.location}\n👤 ${worker.name}\n🕐 ${mins} min\n📞 ${toE164(worker.phone)}`, admins);
        }
      } catch (e) { console.error('short-shift alert failed:', e); }

      // RULE 5: Coverage gap — a next shift at this location starts within 30 min and its assigned worker has no open attendance
      try {
        const nowMs = Date.parse(at);
        const thirtyMins = 30 * 60000;
        const locInstances = await listInstances(gw, { from: today, to: today, location: instance.location });
        for (const next of locInstances) {
          if (next.id === instanceId) continue;
          if ((next.status ?? '') === 'cancelled') continue;
          const nextStartMs = Date.parse(localWallClockToUTC(next.date, next.start, COMPANY_TZ));
          if (!Number.isFinite(nextStartMs)) continue;
          const diff = nextStartMs - nowMs;
          if (diff > thirtyMins || diff < -thirtyMins) continue;
          const nextAssignments = await listAssignments(gw, { instanceId: next.id });
          const otherPhones = nextAssignments.map((a) => a.employeePhone).filter((ph) => ph !== worker.phone);
          if (otherPhones.length === 0) continue;
          const nextAtt = await listAttendance(gw, { instanceId: next.id });
          if (nextAtt.some((a) => a.status === 'open')) continue;
          await notifyAdmins(`🔁 Coverage gap\n📍 ${instance.location}\n👤 ${worker.name} left before the next shift's worker checked in\n📞 ${toE164(worker.phone)}`, admins);
          break;
        }
      } catch (e) { console.error('coverage-gap alert failed:', e); }

      return Response.json({ ok: true, hours: result.hours, inGeofence });
    }
  } catch (err) {
    console.error('checkin failed:', err);
    return Response.json({ error: 'server error' }, { status: 503 });
  }
}
