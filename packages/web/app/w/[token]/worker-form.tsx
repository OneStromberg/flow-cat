'use client';

import { useState } from 'react';
import type { Widget } from '../../../lib/form-widgets';

type Props = { token: string; greeting: string; widgets: Widget[]; today: string };

export function WorkerForm({ token, greeting, widgets, today }: Props) {
  const initial: Record<string, string> = {};
  for (const w of widgets) initial[w.key] = w.kind === 'date' ? today : '';

  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [hours, setHours] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const set = (key: string, value: string) => setAnswers((a) => ({ ...a, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setErrors({});
    setFatal(null);
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, answers }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setHours(data.hours ?? null);
        setStatus('done');
      } else if (res.status === 400 && data.errors) {
        setErrors(data.errors);
        setStatus('idle');
      } else {
        setFatal('Could not save. Please try again.');
        setStatus('idle');
      }
    } catch {
      setFatal('Network error. Please try again.');
      setStatus('idle');
    }
  }

  if (status === 'done') {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <div className="text-4xl">✅</div>
        <h1 className="mt-3 text-xl font-semibold">Logged{hours ? ` ${hours}h` : ''}</h1>
        <button className="mt-6 rounded-lg bg-gray-900 px-4 py-2 text-white" onClick={() => { setAnswers(initial); setStatus('idle'); }}>
          Log another
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">{greeting}</h1>
      <form className="mt-6 space-y-5" onSubmit={submit}>
        {widgets.map((w) => (
          <div key={w.key}>
            <label className="block text-sm font-medium text-gray-700">
              {w.label}{!w.required && <span className="text-gray-400"> (optional)</span>}
            </label>
            {w.kind === 'select' ? (
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
                value={answers[w.key]}
                onChange={(e) => set(w.key, e.target.value)}
              >
                <option value="">Choose…</option>
                {w.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
                type={w.kind === 'date' ? 'date' : w.kind === 'time' ? 'time' : w.kind === 'number' ? 'number' : 'text'}
                value={answers[w.key]}
                max={w.kind === 'date' ? today : undefined}
                onChange={(e) => set(w.key, e.target.value)}
              />
            )}
            {errors[w.key] && <p className="mt-1 text-sm text-red-600">{errors[w.key]}</p>}
          </div>
        ))}
        {fatal && <p className="text-sm text-red-600">{fatal}</p>}
        <button
          type="submit"
          disabled={status === 'saving'}
          className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : 'Submit'}
        </button>
      </form>
    </main>
  );
}
