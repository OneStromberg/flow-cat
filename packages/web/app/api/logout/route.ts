import { clearSessionCookie } from '../../../lib/session';

export const runtime = 'nodejs';

export async function POST() {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
