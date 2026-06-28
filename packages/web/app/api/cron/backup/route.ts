import { getGateway } from '../../../../lib/sheets';
import { backupSpreadsheet } from '../../../../lib/backup';
import { listWorkers } from '@scourage/worklog-core';
import { notifyAdmins, pickAdminChatIds } from '../../../../lib/telegram';

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
    const admins = pickAdminChatIds(await listWorkers(gw));
    await notifyAdmins(
      r.ok ? `💾 Backup saved: ${r.name}` : `⚠️ Backup failed: ${r.reason}`,
      admins,
    );
  } catch (notifyErr) {
    console.error('backup cron notify failed:', notifyErr);
  }

  return Response.json(r);
}
