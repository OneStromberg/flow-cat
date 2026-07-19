'use client';

import useSWR from 'swr';
import { questionToWidget } from '../../../lib/form-widgets';
import { EntryForm } from '../entry-form';
import { t, DEFAULT_LANG, type Lang } from '../../../lib/i18n/strings';
import type { HoursData } from '../../../lib/data/worker-hours';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return iso;
  }
}

export function HoursClient({ lang = DEFAULT_LANG }: { lang?: Lang }) {
  const { data } = useSWR<HoursData>('/api/worker/hours', fetcher);

  if (!data) {
    return (
      <main className="mx-auto max-w-md p-5" aria-busy="true" aria-live="polite">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-1/2 rounded bg-gray-200" />
          <div className="space-y-2">
            <div className="h-16 rounded-lg bg-gray-200" />
            <div className="h-16 rounded-lg bg-gray-200" />
            <div className="h-16 rounded-lg bg-gray-200" />
          </div>
        </div>
      </main>
    );
  }

  const { questions, questionsValid, hasPlaces, places, entries, totalHours, attended, today } = data;
  const fieldKeys = questions.map((q) => q.key);

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="text-xl font-semibold">{t('hours.title', lang)}</h1>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t('hours.newEntry', lang)}</h2>
        {questionsValid && hasPlaces ? (
          <div className="mt-3">
            <EntryForm widgets={questions.map((q) => questionToWidget(q, { places }))} today={today} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-600">
            {!hasPlaces
              ? 'No work sites assigned yet — ask your manager.'
              : 'Not set up yet — ask your manager.'}
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          My hours{totalHours > 0 && <span className="text-gray-400"> · {Math.round(totalHours * 100) / 100}h {t('hours.total', lang)}</span>}
        </h2>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">{t('hours.noEntries', lang)}</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200">
            {entries.map((e) => (
              <li key={e.id || e.rowNumber} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <div className="font-medium">{fieldKeys.map((k) => e.values[k]).filter(Boolean).join(' · ')}</div>
                  {e.hours && <div className="text-gray-500">{e.hours}h</div>}
                </div>
                {e.locked || !e.id ? (
                  <span className="text-gray-400">🔒</span>
                ) : (
                  <a className="text-blue-600 underline" href={`/app/edit/${e.id}`}>Edit</a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t('hours.attended', lang)}</h2>
        {attended.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">{t('hours.noAttended', lang)}</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200">
            {attended.map((a) => (
              <li key={a.id} className="p-3 text-sm">
                <div className="font-medium">
                  {a.date} · {a.location}
                </div>
                <div className="text-gray-500">
                  {fmtTime(a.checkInAt)} → {fmtTime(a.checkOutAt)} · {a.hours}h
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
