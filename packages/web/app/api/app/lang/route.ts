import { getGateway } from '../../../../lib/sheets';
import { requireWorker } from '../../../../lib/session';
import { setWorkerLang } from '@scourage/worklog-core';
import { resolveLang } from '../../../../lib/i18n/strings';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const worker = await requireWorker();
  if (!worker || !worker.active) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const lang = resolveLang(typeof raw.lang === 'string' ? raw.lang : undefined);

  try {
    await setWorkerLang(getGateway(), worker.phone, lang);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('set lang failed:', err);
    return Response.json({ error: 'server error' }, { status: 503 });
  }
}
