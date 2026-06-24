import { getGateway } from '../../../../lib/sheets';
import { generateInstances, listWorkers } from '@scourage/worklog-core';
import { notifyAdmins, pickAdminChatIds } from '../../../../lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const today = new Date().toISOString().slice(0, 10);
  const gw = getGateway();
  try {
    const r = await generateInstances(gw, today);
    const admins = pickAdminChatIds(await listWorkers(gw));
    await notifyAdmins(`🗓 Shift generator: ${r.instancesCreated} new instances, ${r.assignmentsSeeded} assignments seeded (through ${r.horizonEnd}).`, admins);
    return Response.json({ ok: true, ...r });
  } catch (err) {
    console.error('generate-shifts cron failed:', err);
    try {
      const admins = pickAdminChatIds(await listWorkers(gw));
      await notifyAdmins('⚠️ Shift generator FAILED — check logs.', admins);
    } catch (notifyErr) {
      console.error('generate-shifts failure-notify failed:', notifyErr);
    }
    return Response.json({ error: 'generation failed' }, { status: 500 });
  }
}
