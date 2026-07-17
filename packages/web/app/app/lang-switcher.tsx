'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Lang } from '../../lib/i18n/strings';

const OPTIONS: { value: Lang; key: 'profile.langRu' | 'profile.langEn' | 'profile.langHe' }[] = [
  { value: 'ru', key: 'profile.langRu' },
  { value: 'en', key: 'profile.langEn' },
  { value: 'he', key: 'profile.langHe' },
];

export function LangSwitcher({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Lang | null>(null);

  async function choose(next: Lang) {
    if (next === lang || busy) return;
    setBusy(next);
    try {
      await fetch('/api/app/lang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: next }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={busy !== null}
          onClick={() => choose(o.value)}
          className={`rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 ${
            lang === o.value
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-300 text-gray-700'
          }`}
        >
          {t(o.key, lang)}
        </button>
      ))}
    </div>
  );
}
