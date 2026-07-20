import { getGateway } from '../../../../lib/sheets';
import { backupSpreadsheet } from '../../../../lib/backup';
import { listWorkers } from '@scourage/worklog-core';
import { notifyRecipients } from '../../../../lib/push';
import { tf } from '../../../../lib/i18n/strings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const r = await backupSpreadsheet(ts);

  try {
    const gw = getGateway();
    const admins = (await listWorkers(gw)).filter((w) => w.admin);
    await notifyRecipients(
      gw,
      admins,
      (lang) => (r.ok ? tf('alert.backup', lang, { name: r.name }) : tf('alert.backupFailed', lang, { reason: r.reason })),
    );
  } catch (notifyErr) {
    console.error('backup cron notify failed:', notifyErr);
  }

  return Response.json(r);
}
