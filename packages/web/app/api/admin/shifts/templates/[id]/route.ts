import { getGateway } from '../../../../../../lib/sheets';
import { requireAdmin } from '../../../../../../lib/session';
import { deleteTemplate } from '@scourage/worklog-core';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await context.params;

  try {
    const result = await deleteTemplate(getGateway(), id);
    if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('delete template failed:', err);
    return Response.json({ error: 'delete failed' }, { status: 503 });
  }
}
