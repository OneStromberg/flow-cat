'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ShiftTemplate } from '@scourage/worklog-core';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const FORM0 = {
  location: '',
  label: '',
  start: '',
  end: '',
  headcount: '',
  validFrom: '',
  validTo: '',
};

type Props = { templates: ShiftTemplate[]; places: string[] };

export function ShiftsAdmin({ templates, places }: Props) {
  const router = useRouter();
  const [v, setV] = useState({ ...FORM0 });
  const [days, setDays] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof FORM0, val: string) => setV((p) => ({ ...p, [k]: val }));
  const toggleDay = (d: string) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFatal(null);
    try {
      const res = await fetch('/api/admin/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, days }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setV({ ...FORM0 });
        setDays([]);
        router.refresh();
      } else if (res.status === 400 && data.errors) {
        setErrors(data.errors);
        setBusy(false);
      } else {
        setFatal('Could not save. Please try again.');
        setBusy(false);
      }
    } catch {
      setFatal('Network error. Please try again.');
      setBusy(false);
    }
  }

  const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base';

  return (
    <div>
      {/* Template list */}
      <section className="mt-6">
        {templates.length === 0 ? (
          <p className="text-sm text-gray-500">No templates yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="font-medium">{t.location}</span>
                <span className="text-gray-600">{t.label}</span>
                <span className="text-gray-500">{t.days.join(', ')}</span>
                <span className="text-gray-500">{t.start}–{t.end}</span>
                <span className="text-gray-500">×{t.headcount}</span>
                <span className="ml-auto text-xs text-gray-400">{t.validFrom} → {t.validTo}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Add template form */}
      <section className="mt-8">
        <h2 className="text-base font-semibold">Add template</h2>
        <form className="mt-4 space-y-4" onSubmit={submit}>
          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Location</label>
            <select
              className={inputClass}
              value={v.location}
              onChange={(e) => set('location', e.target.value)}
            >
              <option value="">Choose…</option>
              {places.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {errors.location && <p className="mt-1 text-sm text-red-600">{errors.location}</p>}
          </div>

          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Label</label>
            <input
              className={inputClass}
              type="text"
              value={v.label}
              onChange={(e) => set('label', e.target.value)}
            />
            {errors.label && <p className="mt-1 text-sm text-red-600">{errors.label}</p>}
          </div>

          {/* Weekday checkboxes */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Days</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <label key={d} className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={days.includes(d)}
                    onChange={() => toggleDay(d)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  {d}
                </label>
              ))}
            </div>
            {errors.days && <p className="mt-1 text-sm text-red-600">{errors.days}</p>}
          </div>

          {/* Start / End */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Start</label>
              <input
                className={inputClass}
                type="time"
                value={v.start}
                onChange={(e) => set('start', e.target.value)}
              />
              {errors.start && <p className="mt-1 text-sm text-red-600">{errors.start}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">End</label>
              <input
                className={inputClass}
                type="time"
                value={v.end}
                onChange={(e) => set('end', e.target.value)}
              />
              {errors.end && <p className="mt-1 text-sm text-red-600">{errors.end}</p>}
            </div>
          </div>

          {/* Headcount */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Headcount</label>
            <input
              className={inputClass}
              type="number"
              min={1}
              value={v.headcount}
              onChange={(e) => set('headcount', e.target.value)}
            />
            {errors.headcount && <p className="mt-1 text-sm text-red-600">{errors.headcount}</p>}
          </div>

          {/* Valid from / to */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Valid from</label>
              <input
                className={inputClass}
                type="date"
                value={v.validFrom}
                onChange={(e) => set('validFrom', e.target.value)}
              />
              {errors.validFrom && <p className="mt-1 text-sm text-red-600">{errors.validFrom}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Valid to</label>
              <input
                className={inputClass}
                type="date"
                value={v.validTo}
                onChange={(e) => set('validTo', e.target.value)}
              />
              {errors.validTo && <p className="mt-1 text-sm text-red-600">{errors.validTo}</p>}
            </div>
          </div>

          {fatal && <p className="text-sm text-red-600">{fatal}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Add template'}
          </button>
        </form>
      </section>
    </div>
  );
}
