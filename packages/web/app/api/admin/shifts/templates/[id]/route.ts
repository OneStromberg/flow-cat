import { getGateway, COMPANY_TZ } from '../../../../../../lib/sheets';
import { requireAdmin } from '../../../../../../lib/session';
import { deleteTemplate, cancelFutureInstancesForTemplate, todayISO } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await context.params;

  try {
    const gw = getGateway();
    const result = await deleteTemplate(gw, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
    const today = todayISO(COMPANY_TZ);
    await cancelFutureInstancesForTemplate(gw, id, today);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('delete template failed:', err);
    return Response.json({ error: 'delete failed' }, { status: 503 });
  }
}
