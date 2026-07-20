import { getGateway } from '../../../../lib/sheets';
import { generateInstances, listWorkers } from '@scourage/worklog-core';
import { notifyRecipients } from '../../../../lib/push';
import { tf } from '../../../../lib/i18n/strings';

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
    const admins = (await listWorkers(gw)).filter((w) => w.admin);
    await notifyRecipients(gw, admins, (lang) => tf('alert.shiftGen', lang, {
      created: r.instancesCreated,
      seeded: r.assignmentsSeeded,
      horizonEnd: r.horizonEnd,
    }));
    return Response.json({ ok: true, ...r });
  } catch (err) {
    console.error('generate-shifts cron failed:', err);
    try {
      const admins = (await listWorkers(gw)).filter((w) => w.admin);
      await notifyRecipients(gw, admins, (lang) => tf('alert.shiftGenFailed', lang, {}));
    } catch (notifyErr) {
      console.error('generate-shifts failure-notify failed:', notifyErr);
    }
    return Response.json({ error: 'generation failed' }, { status: 500 });
  }
}
