import { requireAdmin } from '../../../../lib/session';
import { signedReadUrl } from '../../../../lib/gcs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin-only: redirects to a freshly-signed, time-limited URL for a private
// check-in photo object. `name` is the stored GCS object name (e.g.
// checkins/<key>-in.jpg). Legacy full-URL values redirect straight through.
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const name = new URL(req.url).searchParams.get('name') ?? '';
  if (!name) return Response.json({ error: 'missing name' }, { status: 400 });
  if (name.startsWith('http')) return Response.redirect(name, 302);
  const url = await signedReadUrl(name);
  if (!url) return Response.json({ error: 'not available' }, { status: 404 });
  return Response.redirect(url, 302);
}
