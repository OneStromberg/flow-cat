import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';

export async function loadActivePlaces(gateway: SheetsGateway): Promise<string[]> {
  const objs = rowsToObjects(await gateway.readTab('Places'));
  return objs
    .filter((o) => {
      const name = (o.place_name ?? '').trim();
      const active = (o.active ?? '').trim().toLowerCase();
      return name !== '' && active !== 'no';
    })
    .map((o) => (o.place_name ?? '').trim());
}

export interface Place {
  name: string;
  active: boolean;
  lat: string;
  lng: string;
  placeId: string;
  address: string;
  client: string;
  geofenceRadiusM: string;
  contact: string;
  baseRate: string;
  requiredAttributes: string[];
  notes: string;
  graceMins: string;
}

export interface AddPlaceInput {
  name: string;
  lat: string;
  lng: string;
  placeId: string;
  address: string;
  client: string;
  geofenceRadiusM: string;
  contact: string;
  baseRate: string;
  requiredAttributes: string;
  notes: string;
  graceMins: string;
}

const PLACES_COLUMNS = ['place_name', 'active', 'lat', 'lng', 'place_id', 'address', 'client', 'geofence_radius_m', 'contact', 'base_rate', 'required_attributes', 'notes', 'grace_mins'];

export function wazeUrl(lat: string, lng: string): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

export function googleMapsUrl(lat: string, lng: string, placeId: string): string {
  const base = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return placeId ? `${base}&query_place_id=${placeId}` : base;
}

export async function listPlaces(gateway: SheetsGateway): Promise<Place[]> {
  const objs = rowsToObjects(await gateway.readTab('Places'));
  return objs
    .filter((o) => (o.place_name ?? '').trim() !== '')
    .map((o) => ({
      name: (o.place_name ?? '').trim(),
      active: (o.active ?? '').trim().toLowerCase() !== 'no',
      lat: (o.lat ?? '').trim(),
      lng: (o.lng ?? '').trim(),
      placeId: (o.place_id ?? '').trim(),
      address: (o.address ?? '').trim(),
      client: (o.client ?? '').trim(),
      geofenceRadiusM: (o.geofence_radius_m ?? '').trim() || '100',
      contact: (o.contact ?? '').trim(),
      baseRate: (o.base_rate ?? '').trim(),
      requiredAttributes: (o.required_attributes ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      notes: (o.notes ?? '').trim(),
      graceMins: (o.grace_mins ?? '').trim(),
    }));
}

export async function updatePlace(
  gateway: SheetsGateway,
  name: string,
  input: AddPlaceInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!numeric(input.lat)) return { ok: false, error: 'lat must be a valid number — select a place from the list' };
  if (!numeric(input.lng)) return { ok: false, error: 'lng must be a valid number — select a place from the list' };
  if (input.geofenceRadiusM.trim() && !numeric(input.geofenceRadiusM)) return { ok: false, error: 'geofenceRadiusM must be a number' };
  if (input.baseRate.trim() && !numeric(input.baseRate)) return { ok: false, error: 'baseRate must be a number' };

  const rows = await gateway.readTab('Places');
  if (rows.length === 0) return { ok: false, error: 'Not found' };
  const header = rows[0].map((h) => h.trim());
  const nameIdx = header.indexOf('place_name');
  const activeIdx = header.indexOf('active');

  const i = rows.findIndex((r, idx) => idx > 0 && (r[nameIdx] ?? '').trim() === name);
  if (i < 0) return { ok: false, error: 'Not found' };

  const existingActive = activeIdx >= 0 ? (rows[i][activeIdx] ?? 'yes') : 'yes';

  const record: Record<string, string> = {
    place_name: name,
    active: existingActive,
    lat: input.lat.trim(),
    lng: input.lng.trim(),
    place_id: input.placeId.trim(),
    address: input.address.trim(),
    client: input.client.trim(),
    geofence_radius_m: input.geofenceRadiusM.trim(),
    contact: input.contact.trim(),
    base_rate: input.baseRate.trim(),
    required_attributes: input.requiredAttributes.trim(),
    notes: input.notes.trim(),
    grace_mins: input.graceMins.trim(),
  };

  await gateway.updateRow('Places', i + 1, objectToRow(record, header));
  return { ok: true };
}

function numeric(s: string): boolean {
  return s.trim() !== '' && Number.isFinite(Number(s));
}

export function placeGraceMins(place: { graceMins?: string } | undefined, def = 10): number {
  const n = Number((place?.graceMins ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : def;
}

export async function addPlace(
  gateway: SheetsGateway,
  input: AddPlaceInput,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  if (!name) errors.name = 'Required';
  if (!numeric(input.lat)) errors.lat = 'Select a place from the list';
  if (!numeric(input.lng)) errors.lng = 'Select a place from the list';
  if (input.geofenceRadiusM.trim() && !numeric(input.geofenceRadiusM)) errors.geofenceRadiusM = 'Must be a number';
  if (input.baseRate.trim() && !numeric(input.baseRate)) errors.baseRate = 'Must be a number';

  if (name) {
    const objs = rowsToObjects(await gateway.readTab('Places'));
    if (objs.some((o) => (o.place_name ?? '').trim().toLowerCase() === name.toLowerCase())) {
      errors.name = 'A place with this name already exists';
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const record: Record<string, string> = {
    place_name: name,
    active: 'yes',
    lat: input.lat.trim(),
    lng: input.lng.trim(),
    place_id: input.placeId.trim(),
    address: input.address.trim(),
    client: input.client.trim(),
    geofence_radius_m: input.geofenceRadiusM.trim(),
    contact: input.contact.trim(),
    base_rate: input.baseRate.trim(),
    required_attributes: input.requiredAttributes.trim(),
    notes: input.notes.trim(),
    grace_mins: input.graceMins.trim(),
  };

  const rows = await gateway.readTab('Places');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];
  const header = [...existing];
  for (const col of PLACES_COLUMNS) if (!header.includes(col)) header.push(col);
  if (existing.length === 0 || header.length !== existing.length) {
    await gateway.writeHeaderRow('Places', header);
  }
  await gateway.appendRow('Places', objectToRow(record, header));
  return { ok: true };
}
