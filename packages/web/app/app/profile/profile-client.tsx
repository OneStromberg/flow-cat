'use client';

import useSWR from 'swr';
import { LogoutButton } from '../logout-button';
import { LangSwitcher } from '../lang-switcher';
import { t, DEFAULT_LANG, type Lang } from '../../../lib/i18n/strings';
import type { ProfileData } from '../../../lib/data/worker-profile';
import { swrFetcher } from '../../../lib/swr-fetcher';

export function ProfileClient({ lang = DEFAULT_LANG }: { lang?: Lang }) {
  const { data } = useSWR<ProfileData>('/api/worker/profile', swrFetcher);

  if (!data) {
    return (
      <main className="mx-auto max-w-md p-5" aria-busy="true" aria-live="polite">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-1/2 rounded bg-gray-200" />
          <div className="space-y-2">
            <div className="h-16 rounded-lg bg-gray-200" />
            <div className="h-10 w-1/3 rounded-lg bg-gray-200" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="text-xl font-semibold">{data.name}</h1>
      <div className="mt-6 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-gray-700">{t('profile.language', lang)}</h2>
          <div className="mt-2">
            <LangSwitcher lang={lang} />
          </div>
        </div>
        {data.telegramLinked ? (
          <p className="text-sm text-green-700">Telegram connected ✓</p>
        ) : data.telegramConnectUrl ? (
          <a
            href={data.telegramConnectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-sky-600 px-3 py-2 text-sm text-white"
          >
            Connect Telegram
          </a>
        ) : (
          <p className="text-sm text-gray-400">Telegram not configured.</p>
        )}
        <LogoutButton />
      </div>
    </main>
  );
}
