import { redirect } from 'next/navigation';
import { requireWorker } from '../../../lib/session';
import { resolveLang } from '../../../lib/i18n/strings';
import { ProfileClient } from './profile-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const worker = await requireWorker();
  if (!worker || !worker.active) redirect('/login');
  const lang = resolveLang(worker.lang);

  return <ProfileClient lang={lang} />;
}
