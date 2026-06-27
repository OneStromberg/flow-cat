import { redirect } from 'next/navigation';
import { requireWorker } from '../../../lib/session';
import { TelegramConnect } from '../../components/telegram-connect';
import { LogoutButton } from '../logout-button';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const worker = await requireWorker();
  if (!worker || !worker.active) redirect('/login');

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="text-xl font-semibold">{worker.name}</h1>
      <div className="mt-6 space-y-4">
        <TelegramConnect phone={worker.phone} linked={!!worker.telegramChatId} />
        <LogoutButton />
      </div>
    </main>
  );
}
