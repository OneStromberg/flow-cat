'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Widget } from '../../../../lib/form-widgets';
import { t, DEFAULT_LANG, type Lang } from '../../../../lib/i18n/strings';

type Props = { id: string; widgets: Widget[]; initial: Record<string, string>; today: string; lang?: Lang };

export function EditForm({ id, widgets, initial, today, lang = DEFAULT_LANG }: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: string, value: string) => setAnswers((a) => ({ ...a, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFatal(null);
    try {
      const res = await fetch(`/api/entries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        router.replace('/app');
        router.refresh();
      } else if (res.status === 400 && data.errors) {
        setErrors(data.errors);
        setBusy(false);
      } else {
        setFatal(res.status === 403 ? 'This entry is locked.' : t('checkin.generic', lang));
        setBusy(false);
      }
    } catch {
      setFatal(t('checkin.network', lang));
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {widgets.map((w) => (
        <div key={w.key}>
          <label className="block text-sm font-medium text-gray-700">{w.label}</label>
          {w.kind === 'select' ? (
            <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
              value={answers[w.key] ?? ''} onChange={(e) => set(w.key, e.target.value)}>
              <option value="">Choose…</option>
              {w.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
              type={w.kind === 'date' ? 'date' : w.kind === 'time' ? 'time' : w.kind === 'number' ? 'number' : 'text'}
              value={answers[w.key] ?? ''} max={w.kind === 'date' ? today : undefined}
              onChange={(e) => set(w.key, e.target.value)} />
          )}
          {errors[w.key] && <p className="mt-1 text-sm text-red-600">{errors[w.key]}</p>}
        </div>
      ))}
      {fatal && <p className="text-sm text-red-600">{fatal}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={busy}
          className="flex-1 rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
          {busy ? t('checkin.saving', lang) : 'Save'}
        </button>
        <a href="/app" className="rounded-lg border border-gray-300 px-4 py-3 text-base">Cancel</a>
      </div>
    </form>
  );
}
