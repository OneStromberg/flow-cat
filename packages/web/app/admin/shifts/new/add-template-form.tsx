'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const FORM0 = {
  location: '',
  label: '',
  start: '',
  end: '',
  headcount: '',
  validFrom: '',
  validTo: '',
  rate: '',
  instructions: '',
};

type Props = {
  places: string[];
};

export function AddTemplateForm({ places }: Props) {
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
        router.push('/admin/shifts');
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
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
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

      {/* Rate */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Rate (optional)</label>
        <input
          className={inputClass}
          type="number"
          min={0}
          value={v.rate}
          onChange={(e) => set('rate', e.target.value)}
        />
        {errors.rate && <p className="mt-1 text-sm text-red-600">{errors.rate}</p>}
      </div>

      {/* Instructions */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Instructions (tasks for this role)</label>
        <textarea
          className={inputClass}
          rows={3}
          value={v.instructions}
          onChange={(e) => set('instructions', e.target.value)}
        />
        {errors.instructions && <p className="mt-1 text-sm text-red-600">{errors.instructions}</p>}
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
  );
}
