import { getGateway, COMPANY_TZ } from '../../../../../lib/sheets';
import { requireManagerOrAdmin } from '../../../../../lib/session';
import { listTemplates, listInstances, cancelFutureInstancesForTemplate, listPlaces, todayISO } from '@scourage/worklog-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const admin = await requireManagerOrAdmin();
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const gw = getGateway();
  const today = todayISO(COMPANY_TZ);
  const [templates, places] = await Promise.all([listTemplates(gw), listPlaces(gw)]);
  const activeTemplateIds = new Set(templates.filter((t) => t.active).map((t) => t.id));
  const activePlaceNames = new Set(places.filter((p) => p.active).map((p) => p.name));
  const future = await listInstances(gw, { from: today, to: '2099-12-31' });
  let cancelled = 0;
  const orphanTemplateIds = new Set<string>();
  for (const inst of future) {
    if (inst.status !== 'scheduled') continue;
    const orphanByTemplate = !activeTemplateIds.has(inst.templateId);
    const orphanByPlace = !activePlaceNames.has(inst.location);
    if (orphanByTemplate || orphanByPlace) orphanTemplateIds.add(inst.templateId);
  }
  for (const tid of orphanTemplateIds) {
    const res = await cancelFutureInstancesForTemplate(gw, tid, today);
    cancelled += res.cancelled;
  }
  return Response.json({ ok: true, cancelled });
}
