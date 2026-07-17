import { redirect } from 'next/navigation';
import { requireWorker } from '../../../lib/session';
import { TelegramConnect } from '../../components/telegram-connect';
import { LogoutButton } from '../logout-button';
import { LangSwitcher } from '../lang-switcher';
import { t, resolveLang } from '../../../lib/i18n/strings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const worker = await requireWorker();
  if (!worker || !worker.active) redirect('/login');
  const lang = resolveLang(worker.lang);

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="text-xl font-semibold">{worker.name}</h1>
      <div className="mt-6 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-gray-700">{t('profile.language', lang)}</h2>
          <div className="mt-2">
            <LangSwitcher lang={lang} />
          </div>
        </div>
        <TelegramConnect phone={worker.phone} linked={!!worker.telegramChatId} />
        <LogoutButton />
      </div>
    </main>
  );
}
