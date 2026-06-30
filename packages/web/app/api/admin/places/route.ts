import { getGateway } from '../../../../lib/sheets';
import { requireAdmin } from '../../../../lib/session';
import { addPlace, updatePlace, type AddPlaceInput } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const input: AddPlaceInput = {
    name: str(b.name), lat: str(b.lat), lng: str(b.lng), placeId: str(b.placeId), address: str(b.address),
    client: str(b.client), geofenceRadiusM: str(b.geofenceRadiusM), contact: str(b.contact), baseRate: str(b.baseRate), requiredAttributes: str(b.requiredAttributes), notes: str(b.notes),
    graceMins: str(b.graceMins ?? b.grace_mins),
  };

  try {
    const r = await addPlace(getGateway(), input);
    if (!r.ok) return Response.json({ errors: r.errors }, { status: 400 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('add place failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}

export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const existingName = str(b.existingName);
  if (!existingName) return Response.json({ error: 'existingName required' }, { status: 400 });

  const input: AddPlaceInput = {
    name: str(b.name), lat: str(b.lat), lng: str(b.lng), placeId: str(b.placeId), address: str(b.address),
    client: str(b.client), geofenceRadiusM: str(b.geofenceRadiusM), contact: str(b.contact), baseRate: str(b.baseRate), requiredAttributes: str(b.requiredAttributes), notes: str(b.notes),
    graceMins: str(b.graceMins ?? b.grace_mins),
  };

  try {
    const r = await updatePlace(getGateway(), existingName, input);
    if (!r.ok) return Response.json({ error: r.error }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('update place failed:', err);
    return Response.json({ error: 'save failed' }, { status: 503 });
  }
}
