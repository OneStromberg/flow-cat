import { getGateway, COMPANY_TZ } from '../../../../lib/sheets';
import { findMissedCheckins, recordAlerts, listWorkers, toE164 } from '@scourage/worklog-core';
import { notifyRecipients, notifyPhone, sendPushToPhone } from '../../../../lib/push';
import { tf, resolveLang } from '../../../../lib/i18n/strings';
import { formatHmInTz } from '../../../../lib/format-time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const gw = getGateway();
  const now = new Date().toISOString();

  try {
    const missed = await findMissedCheckins(gw, now, 10, COMPANY_TZ);
    const nowMs = Date.parse(now);
    const HORIZON_MS = 2 * 60 * 60 * 1000; // stop re-alerting ~2h after the expected time
    const CHECKIN_REALERT_MS = 4 * 60_000; // ~ every 5-min cron run
    const workers = await listWorkers(gw);
    const phoneToName = new Map(workers.map((w) => [w.phone, w.name]));
    const phoneToLang = new Map(workers.map((w) => [w.phone, w.lang]));
    const admins = workers.filter((w) => w.admin);

    const adminDue: typeof missed = [];
    for (const m of missed) {
      // stale missed check-ins stop re-alerting (check-out has no horizon)
      if (m.type === 'in' && Number.isFinite(nowMs) && nowMs - Date.parse(m.expectedAt) > HORIZON_MS) continue;

      // admin cadence: check-out alerts once ever, check-in re-alerts every cron run
      const adminTtl = m.type === 'out' ? Infinity : CHECKIN_REALERT_MS;
      if (await gw.tryClaim(`${m.instanceId}|${m.employeePhone}|${m.type}|admin`, adminTtl, nowMs)) {
        adminDue.push(m);
      }

      // worker notify: exactly once per event, no re-nag. Routed through the
      // push-or-Telegram cutover (notifyPhone) so linked workers without a push
      // subscription still get reached; falls back to direct push if the worker
      // record can't be found (shouldn't happen for an assigned worker).
      if (await gw.tryClaim(`${m.instanceId}|${m.employeePhone}|${m.type}|worker`, Infinity, nowMs)) {
        const worker = workers.find((w) => w.phone === m.employeePhone);
        const workerLang = resolveLang(worker?.lang ?? phoneToLang.get(m.employeePhone));
        const body = tf('alert.workerMissed', workerLang, {
          checkType: tf(m.type === 'in' ? 'alert.checkIn' : 'alert.checkOut', workerLang, {}),
          location: m.location,
        });
        if (worker) {
          await notifyPhone(gw, worker, body, { url: '/app/checkin' });
        } else {
          await sendPushToPhone(gw, m.employeePhone, { title: 'FlowCat', body, url: '/app/checkin' });
        }
      }
    }

    if (adminDue.length > 0) {
      const byLocation = new Map<string, typeof adminDue>();
      for (const m of adminDue) {
        const arr = byLocation.get(m.location) ?? [];
        arr.push(m);
        byLocation.set(m.location, arr);
      }

      for (const [location, events] of byLocation) {
        // build+send per admin, in that admin's own language (notifyRecipients calls
        // this per recipient with their resolved lang — no shared/English-only string)
        await notifyRecipients(gw, admins, (lang) => {
          const header = tf('alert.missedGroupHeader', lang, { location });
          const lines = events.map((m) => tf('alert.missedLine', lang, {
            name: phoneToName.get(m.employeePhone) || m.employeePhone,
            checkType: tf(m.type === 'in' ? 'alert.checkIn' : 'alert.checkOut', lang, {}),
            time: formatHmInTz(m.expectedAt, COMPANY_TZ),
            phone: toE164(m.employeePhone),
          }));
          return `${header}\n${lines.join('\n')}`;
        }, { url: '/admin/attendance' });
      }

      await recordAlerts(gw, adminDue); // audit trail
    }

    return Response.json({ ok: true, missed: missed.length, alerted: adminDue.length });
  } catch (err) {
    console.error('missed-checkins cron failed:', err);
    try {
      const workers = await listWorkers(gw);
      const admins = workers.filter((w) => w.admin);
      await notifyRecipients(gw, admins, (lang) => tf('alert.missedDetectorFailed', lang, {}));
    } catch (notifyErr) {
      console.error('missed-checkins failure-notify failed:', notifyErr);
    }
    return Response.json({ error: 'detection failed' }, { status: 500 });
  }
}
