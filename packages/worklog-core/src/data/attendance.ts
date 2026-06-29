import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';

export interface Attendance {
  id: string;
  instanceId: string;
  employeePhone: string;
  date: string;
  checkInAt: string;
  checkInLat: string;
  checkInLng: string;
  checkInPhoto: string;
  checkInInGeofence: boolean;
  checkOutAt: string;
  checkOutLat: string;
  checkOutLng: string;
  checkOutPhoto: string;
  checkOutInGeofence: boolean;
  hours: string;
  status: string;
}

const ATT_COLUMNS = [
  'id', 'instance_id', 'employee_phone', 'date',
  'check_in_at', 'check_in_lat', 'check_in_lng', 'check_in_photo', 'check_in_in_geofence',
  'check_out_at', 'check_out_lat', 'check_out_lng', 'check_out_photo', 'check_out_in_geofence',
  'hours', 'status',
];

// ── Header helper ─────────────────────────────────────────────────────────────

async function ensureAttHeader(gateway: SheetsGateway): Promise<string[]> {
  const rows = await gateway.readTab('Attendance');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];
  const header = [...existing];
  for (const c of ATT_COLUMNS) if (!header.includes(c)) header.push(c);
  if (existing.length === 0 || header.length !== existing.length) {
    await gateway.writeHeaderRow('Attendance', header);
  }
  return header;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function withinGeofence(distM: number, radiusM: number): boolean {
  return distM <= radiusM;
}

export function hoursBetween(a: string, b: string): number {
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0;
  return Math.round(((t2 - t1) / 3600000) * 100) / 100;
}

// ── Row → object mapper ───────────────────────────────────────────────────────

function toAttendance(o: Record<string, string>): Attendance {
  return {
    id: (o.id ?? '').trim(),
    instanceId: (o.instance_id ?? '').trim(),
    employeePhone: (o.employee_phone ?? '').trim(),
    date: (o.date ?? '').trim(),
    checkInAt: (o.check_in_at ?? '').trim(),
    checkInLat: (o.check_in_lat ?? '').trim(),
    checkInLng: (o.check_in_lng ?? '').trim(),
    checkInPhoto: (o.check_in_photo ?? '').trim(),
    checkInInGeofence: (o.check_in_in_geofence ?? '').trim() === 'yes',
    checkOutAt: (o.check_out_at ?? '').trim(),
    checkOutLat: (o.check_out_lat ?? '').trim(),
    checkOutLng: (o.check_out_lng ?? '').trim(),
    checkOutPhoto: (o.check_out_photo ?? '').trim(),
    checkOutInGeofence: (o.check_out_in_geofence ?? '').trim() === 'yes',
    hours: (o.hours ?? '').trim(),
    status: (o.status ?? '').trim(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function listAttendance(
  gateway: SheetsGateway,
  filter: { instanceId?: string; employeePhone?: string; from?: string; to?: string },
): Promise<Attendance[]> {
  const objs = rowsToObjects(await gateway.readTab('Attendance'));
  return objs
    .filter((o) => (o.id ?? '').trim() !== '')
    .filter((o) => !filter.instanceId || (o.instance_id ?? '').trim() === filter.instanceId)
    .filter((o) => !filter.employeePhone || (o.employee_phone ?? '').trim() === filter.employeePhone)
    .filter((o) => {
      if (!filter.from && !filter.to) return true;
      const date = (o.date ?? '').trim();
      if (filter.from && date < filter.from) return false;
      if (filter.to && date > filter.to) return false;
      return true;
    })
    .map(toAttendance);
}

export async function checkIn(
  gateway: SheetsGateway,
  params: {
    instanceId: string;
    employeePhone: string;
    at: string;
    lat: string;
    lng: string;
    photo: string;
    inGeofence: boolean;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  // Look up the ShiftInstance to get the date
  const instanceRows = rowsToObjects(await gateway.readTab('ShiftInstances'));
  const instance = instanceRows.find(
    (o) => (o.id ?? '').trim() === params.instanceId,
  );
  if (!instance) {
    return { ok: false, error: 'instance not found' };
  }
  const date = (instance.date ?? '').trim();

  // Reject if already checked in (open row exists for this instance+phone)
  const attRows = rowsToObjects(await gateway.readTab('Attendance'));
  const existing = attRows.find(
    (o) =>
      (o.instance_id ?? '').trim() === params.instanceId &&
      (o.employee_phone ?? '').trim() === params.employeePhone &&
      (o.status ?? '').trim() === 'open',
  );
  if (existing) {
    return { ok: false, error: 'already checked in' };
  }

  const header = await ensureAttHeader(gateway);
  const id = 'att_' + crypto.randomUUID().slice(0, 8);

  const record: Record<string, string> = {
    id,
    instance_id: params.instanceId,
    employee_phone: params.employeePhone,
    date,
    check_in_at: params.at,
    check_in_lat: params.lat,
    check_in_lng: params.lng,
    check_in_photo: params.photo,
    check_in_in_geofence: params.inGeofence ? 'yes' : 'no',
    check_out_at: '',
    check_out_lat: '',
    check_out_lng: '',
    check_out_photo: '',
    check_out_in_geofence: '',
    hours: '',
    status: 'open',
  };

  await gateway.appendRow('Attendance', objectToRow(record, header));
  return { ok: true, id };
}

export async function checkOut(
  gateway: SheetsGateway,
  params: {
    instanceId: string;
    employeePhone: string;
    at: string;
    lat: string;
    lng: string;
    photo: string;
    inGeofence: boolean;
  },
): Promise<{ ok: true; hours: string } | { ok: false; error: string }> {
  const rows = await gateway.readTab('Attendance');
  if (!rows.length) return { ok: false, error: 'no open check-in found' };

  const header = rows[0].map((h) => h.trim());
  const idxInstanceId = header.indexOf('instance_id');
  const idxPhone = header.indexOf('employee_phone');
  const idxStatus = header.indexOf('status');
  const idxCheckInAt = header.indexOf('check_in_at');

  const i = rows.findIndex(
    (r, idx) =>
      idx > 0 &&
      (r[idxInstanceId] ?? '').trim() === params.instanceId &&
      (r[idxPhone] ?? '').trim() === params.employeePhone &&
      (r[idxStatus] ?? '').trim() === 'open',
  );

  if (i < 0) return { ok: false, error: 'no open check-in found' };

  const checkInAt = (rows[i][idxCheckInAt] ?? '').trim();
  const hours = String(hoursBetween(checkInAt, params.at));

  const newRow = [...rows[i]];
  newRow[header.indexOf('check_out_at')] = params.at;
  newRow[header.indexOf('check_out_lat')] = params.lat;
  newRow[header.indexOf('check_out_lng')] = params.lng;
  newRow[header.indexOf('check_out_photo')] = params.photo;
  newRow[header.indexOf('check_out_in_geofence')] = params.inGeofence ? 'yes' : 'no';
  newRow[header.indexOf('hours')] = hours;
  newRow[idxStatus] = 'closed';

  await gateway.updateRow('Attendance', i + 1, newRow);
  return { ok: true, hours };
}

export async function adminCorrect(
  gateway: SheetsGateway,
  attendanceId: string,
  fields: { checkInAt?: string; checkOutAt?: string; hours?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await gateway.readTab('Attendance');
  if (!rows.length) return { ok: false, error: 'attendance record not found' };

  const header = rows[0].map((h) => h.trim());
  const idxId = header.indexOf('id');
  const idxCheckInAt = header.indexOf('check_in_at');
  const idxCheckOutAt = header.indexOf('check_out_at');
  const idxHours = header.indexOf('hours');
  const idxStatus = header.indexOf('status');

  const i = rows.findIndex(
    (r, idx) => idx > 0 && (r[idxId] ?? '').trim() === attendanceId,
  );

  if (i < 0) return { ok: false, error: 'attendance record not found' };

  const newRow = [...rows[i]];

  if (fields.checkInAt !== undefined) newRow[idxCheckInAt] = fields.checkInAt;
  if (fields.checkOutAt !== undefined) newRow[idxCheckOutAt] = fields.checkOutAt;

  // An explicit hours override always wins; otherwise recompute from both timestamps.
  if (fields.hours !== undefined) {
    newRow[idxHours] = fields.hours;
  } else if ((newRow[idxCheckInAt] ?? '') && (newRow[idxCheckOutAt] ?? '')) {
    newRow[idxHours] = String(hoursBetween(newRow[idxCheckInAt], newRow[idxCheckOutAt]));
  }

  newRow[idxStatus] = 'corrected';

  await gateway.updateRow('Attendance', i + 1, newRow);
  return { ok: true };
}
