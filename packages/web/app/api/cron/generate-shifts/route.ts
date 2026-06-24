import { getGateway } from '../../../../lib/sheets';
import { generateInstances } from '@scourage/worklog-core';
import { notifyAdmins } from '../../../../lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const today = new Date().toISOString().slice(0, 10);
  try {
    const r = await generateInstances(getGateway(), today);
    await notifyAdmins(`🗓 Shift generator: ${r.instancesCreated} new instances, ${r.assignmentsSeeded} assignments seeded (through ${r.horizonEnd}).`);
    return Response.json({ ok: true, ...r });
  } catch (err) {
    console.error('generate-shifts cron failed:', err);
    await notifyAdmins('⚠️ Shift generator FAILED — check logs.');
    return Response.json({ error: 'generation failed' }, { status: 500 });
  }
}
