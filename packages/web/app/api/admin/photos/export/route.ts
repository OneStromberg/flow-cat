import { requireAdmin } from '../../../../../lib/session';
import { getGateway, COMPANY_TZ } from '../../../../../lib/sheets';
import { downloadPhoto, photoZipEntryName, buildStoreZip, sanitizeHeaderValue, exportDefaultFromISO } from '../../../../../lib/gcs';
import { listInstances, listAttendance, listWorkers, todayISO } from '@scourage/worklog-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const place = typeof b.place === 'string' ? b.place : '';
  const today = todayISO(COMPANY_TZ);
  const to = typeof b.to === 'string' && b.to ? b.to : today;
  // Bounded default: no explicit `from` means "last 90 days", not full history —
  // old pre-compression photos aren't auto-deleted, so unbounded pulls the whole corpus.
  const from = typeof b.from === 'string' && b.from ? b.from : exportDefaultFromISO(today);
  if (!place) return Response.json({ error: 'place required' }, { status: 400 });

  const gw = getGateway();
  const [instances, workers] = await Promise.all([
    listInstances(gw, { from, to, location: place }),
    listWorkers(gw),
  ]);
  const nameByPhone = new Map(workers.map((w) => [w.phone, w.name]));

  const entries: { name: string; data: Buffer }[] = [];
  for (const inst of instances) {
    const att = await listAttendance(gw, { instanceId: inst.id });
    for (const a of att) {
      const worker = nameByPhone.get(a.employeePhone) ?? a.employeePhone;
      if (a.checkInPhoto && a.checkInAt) {
        const buf = await downloadPhoto(a.checkInPhoto);
        if (buf) entries.push({ name: photoZipEntryName(a.checkInAt, COMPANY_TZ, worker, 'in'), data: buf });
      }
      if (a.checkOutPhoto && a.checkOutAt) {
        const buf = await downloadPhoto(a.checkOutPhoto);
        if (buf) entries.push({ name: photoZipEntryName(a.checkOutAt, COMPANY_TZ, worker, 'out'), data: buf });
      }
    }
  }
  const zip = buildStoreZip(entries);
  return new Response(new Uint8Array(zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="photos ${sanitizeHeaderValue(place)} ${sanitizeHeaderValue(from)}..${sanitizeHeaderValue(to)}.zip"`,
    },
  });
}
