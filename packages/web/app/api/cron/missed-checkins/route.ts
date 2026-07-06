import { getGateway, COMPANY_TZ } from '../../../../lib/sheets';
import { findMissedCheckins, lastAlertAtByKey, shouldRealert, recordAlerts, listWorkers } from '@scourage/worklog-core';
import { notifyAdmins, pickAdminChatIds } from '../../../../lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatExpectedTime(iso: string): string {
  return iso.slice(11, 16);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const gw = getGateway();
  const now = new Date().toISOString();

  try {
    const missed = await findMissedCheckins(gw, now, 10, COMPANY_TZ);
    const lastAt = await lastAlertAtByKey(gw);
    const due = missed.filter((m) => shouldRealert(lastAt.get(`${m.instanceId}|${m.employeePhone}|${m.type}`), now, 5 * 60000));

    if (due.length > 0) {
      const workers = await listWorkers(gw);
      const phoneToName = new Map(workers.map(w => [w.phone, w.name]));

      const lines = due.map(m => {
        const name = phoneToName.get(m.employeePhone) || m.employeePhone;
        const checkType = m.type === 'in' ? 'check-in' : 'check-out';
        const expectedTime = formatExpectedTime(m.expectedAt);
        return `⚠️ ${name} missed ${checkType} at ${m.location} (expected ${expectedTime}) — 📞 ${m.employeePhone}`;
      });

      const message = `Missed checkins:\n${lines.join('\n')}`;
      const admins = pickAdminChatIds(workers);

      await notifyAdmins(message, admins);
      await recordAlerts(gw, due);
    }

    return Response.json({ ok: true, missed: missed.length, alerted: due.length });
  } catch (err) {
    console.error('missed-checkins cron failed:', err);
    try {
      const workers = await listWorkers(gw);
      const admins = pickAdminChatIds(workers);
      await notifyAdmins('⚠️ Missed-checkin detector FAILED — check logs.', admins);
    } catch (notifyErr) {
      console.error('missed-checkins failure-notify failed:', notifyErr);
    }
    return Response.json({ error: 'detection failed' }, { status: 500 });
  }
}
