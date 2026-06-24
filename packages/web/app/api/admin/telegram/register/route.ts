import { requireAdmin } from '../../../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (!token || !secret) return Response.json({ error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET not set' }, { status: 400 });
  const url = `${new URL(req.url).origin}/api/telegram/webhook`;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secret, allowed_updates: ['message'] }),
  });
  return Response.json(await res.json());
}
