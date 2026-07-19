'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
type Day = (typeof DAY_ORDER)[number];

type SlotState = { start: string; end: string };
type DayState = { on: boolean; slots: SlotState[] };
type DayGrid = Record<Day, DayState>;

type RecurMode = 'forever' | 'nweeks' | 'fromto';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function initGrid(): DayGrid {
  return Object.fromEntries(DAY_ORDER.map((d) => [d, { on: false, slots: [{ start: '', end: '' }] }])) as DayGrid;
}

type Props = { places: string[] };

export function AddTemplateForm({ places }: Props) {
  const router = useRouter();

  // base fields
  const [location, setLocation] = useState('');
  const [label, setLabel] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [rate, setRate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selfieStart, setSelfieStart] = useState(false);
  const [selfieEnd, setSelfieEnd] = useState(false);

  // per-day grid
  const [grid, setGrid] = useState<DayGrid>(initGrid);
  // default times for "apply to enabled" convenience
  const [defStart, setDefStart] = useState('09:00');
  const [defEnd, setDefEnd] = useState('17:00');

  // recurrence
  const [recurMode, setRecurMode] = useState<RecurMode>('forever');
  const [startDate, setStartDate] = useState(today());
  const [nWeeks, setNWeeks] = useState('4');
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  // grid helpers
  function toggleDay(day: Day) {
    setGrid((g) => ({ ...g, [day]: { ...g[day], on: !g[day].on } }));
  }
  function setSlotField(day: Day, idx: number, field: 'start' | 'end', val: string) {
    setGrid((g) => {
      const slots = g[day].slots.map((s, i) => (i === idx ? { ...s, [field]: val } : s));
      return { ...g, [day]: { ...g[day], slots } };
    });
  }
  function addSlot(day: Day) {
    setGrid((g) => ({
      ...g,
      [day]: { ...g[day], slots: [...g[day].slots, { start: '', end: '' }] },
    }));
  }
  function removeSlot(day: Day, idx: number) {
    setGrid((g) => {
      const slots = g[day].slots.filter((_, i) => i !== idx);
      return { ...g, [day]: { ...g[day], slots: slots.length ? slots : [{ start: '', end: '' }] } };
    });
  }
  function applyDefaults() {
    setGrid((g) => {
      const next = { ...g };
      for (const d of DAY_ORDER) {
        if (next[d].on) next[d] = { ...next[d], slots: next[d].slots.map(() => ({ start: defStart, end: defEnd })) };
      }
      return next;
    });
  }

  // compute validFrom / validTo from recurrence mode
  function getDateRange(): { validFrom: string; validTo: string } {
    if (recurMode === 'forever') return { validFrom: startDate, validTo: '' };
    if (recurMode === 'nweeks') {
      const n = parseInt(nWeeks, 10) || 1;
      return { validFrom: startDate, validTo: addDays(startDate, n * 7 - 1) };
    }
    return { validFrom: fromDate, validTo: toDate };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFatal(null);

    // local validation
    const enabled = DAY_ORDER.filter((d) => grid[d].on);
    const clientErrors: Record<string, string> = {};
    if (enabled.length === 0) clientErrors.dayTimes = 'Select at least one day.';
    for (const d of enabled) {
      for (const slot of grid[d].slots) {
        if (!slot.start || !slot.end)
          clientErrors.dayTimes = `${d} has a slot missing a start or end time.`;
      }
    }
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      return;
    }

    const dayTimes = enabled.flatMap((d) => grid[d].slots.map((s) => ({ day: d, start: s.start, end: s.end })));
    const { validFrom, validTo } = getDateRange();

    setBusy(true);
    try {
      const res = await fetch('/api/admin/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, label, headcount, rate, instructions, validFrom, validTo, dayTimes, selfieStart, selfieEnd }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.seedWarning) {
          setSyncNote('Saved. Staffing is syncing — refresh in a moment.');
          setTimeout(() => router.push('/admin/shifts'), 1800);
        } else {
          router.push('/admin/shifts');
        }
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

  const inp = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base';
  const smInp = 'rounded-lg border border-gray-300 px-2 py-2 text-base';

  return (
    <form className="mt-4 space-y-6" onSubmit={submit}>
      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Location</label>
        <select className={inp} value={location} onChange={(e) => setLocation(e.target.value)}>
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
        <input className={inp} type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
        {errors.label && <p className="mt-1 text-sm text-red-600">{errors.label}</p>}
      </div>

      {/* Per-day weekday grid */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700">Schedule</legend>

        {/* Convenience: default times + apply */}
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <span className="text-xs text-gray-500">Default:</span>
          <input
            type="time"
            value={defStart}
            onChange={(e) => setDefStart(e.target.value)}
            className={smInp + ' w-28'}
            aria-label="Default start time"
          />
          <span className="text-xs text-gray-400">–</span>
          <input
            type="time"
            value={defEnd}
            onChange={(e) => setDefEnd(e.target.value)}
            className={smInp + ' w-28'}
            aria-label="Default end time"
          />
          <button
            type="button"
            onClick={applyDefaults}
            className="rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300"
          >
            Apply to checked days
          </button>
        </div>

        {/* 7-row grid */}
        <div className="mt-3 space-y-3">
          {DAY_ORDER.map((day) => {
            const row = grid[day];
            return (
              <div key={day} className="space-y-1">
                {row.slots.map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    {/* checkbox + day label — only on first slot row */}
                    {idx === 0 ? (
                      <label className="flex w-14 shrink-0 cursor-pointer items-center gap-1.5 text-sm font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={row.on}
                          onChange={() => toggleDay(day)}
                          className="h-5 w-5 rounded border-gray-300"
                        />
                        {day}
                      </label>
                    ) : (
                      <div className="w-14 shrink-0" />
                    )}
                    {/* start */}
                    <input
                      type="time"
                      value={slot.start}
                      disabled={!row.on}
                      onChange={(e) => setSlotField(day, idx, 'start', e.target.value)}
                      className={smInp + ' w-full disabled:opacity-40'}
                      aria-label={`${day} shift ${idx + 1} start`}
                    />
                    <span className="shrink-0 text-xs text-gray-400">–</span>
                    {/* end */}
                    <input
                      type="time"
                      value={slot.end}
                      disabled={!row.on}
                      onChange={(e) => setSlotField(day, idx, 'end', e.target.value)}
                      className={smInp + ' w-full disabled:opacity-40'}
                      aria-label={`${day} shift ${idx + 1} end`}
                    />
                    {/* remove slot — only when enabled and 2+ slots exist */}
                    {row.on && row.slots.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeSlot(day, idx)}
                        className="shrink-0 text-lg leading-none text-gray-400 hover:text-red-500"
                        aria-label={`Remove ${day} shift ${idx + 1}`}
                      >
                        ×
                      </button>
                    ) : (
                      <div className="w-5 shrink-0" />
                    )}
                  </div>
                ))}
                {/* add shift button — only when day is enabled */}
                {row.on && (
                  <div className="flex items-center gap-3">
                    <div className="w-14 shrink-0" />
                    <button
                      type="button"
                      onClick={() => addSlot(day)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      + add shift
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {errors.dayTimes && <p className="mt-2 text-sm text-red-600">{errors.dayTimes}</p>}
      </fieldset>

      {/* Recurrence picker */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700">Recurrence</legend>
        <select
          className={inp}
          value={recurMode}
          onChange={(e) => setRecurMode(e.target.value as RecurMode)}
        >
          <option value="forever">Forever</option>
          <option value="nweeks">For N weeks</option>
          <option value="fromto">Date range</option>
        </select>

        {recurMode === 'forever' && (
          <div className="mt-3">
            <label className="block text-sm text-gray-600">Starting from</label>
            <input
              type="date"
              className={inp}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        )}

        {recurMode === 'nweeks' && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-sm text-gray-600">Starting from</label>
                <input
                  type="date"
                  className={inp}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="w-24">
                <label className="block text-sm text-gray-600">Weeks</label>
                <input
                  type="number"
                  min={1}
                  className={inp}
                  value={nWeeks}
                  onChange={(e) => setNWeeks(e.target.value)}
                />
              </div>
            </div>
            {startDate && nWeeks && (
              <p className="text-xs text-gray-500">
                Valid until {addDays(startDate, (parseInt(nWeeks, 10) || 1) * 7 - 1)}
              </p>
            )}
          </div>
        )}

        {recurMode === 'fromto' && (
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600">From</label>
              <input
                type="date"
                className={inp}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              {errors.validFrom && <p className="mt-1 text-sm text-red-600">{errors.validFrom}</p>}
            </div>
            <div>
              <label className="block text-sm text-gray-600">To</label>
              <input
                type="date"
                className={inp}
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
              {errors.validTo && <p className="mt-1 text-sm text-red-600">{errors.validTo}</p>}
            </div>
          </div>
        )}
      </fieldset>

      {/* Headcount */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Headcount</label>
        <input
          className={inp}
          type="number"
          min={1}
          value={headcount}
          onChange={(e) => setHeadcount(e.target.value)}
        />
        {errors.headcount && <p className="mt-1 text-sm text-red-600">{errors.headcount}</p>}
      </div>

      {/* Rate */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Rate (optional)</label>
        <input
          className={inp}
          type="number"
          min={0}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
        {errors.rate && <p className="mt-1 text-sm text-red-600">{errors.rate}</p>}
      </div>

      {/* Instructions */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Instructions (tasks for this role)</label>
        <textarea
          className={inp}
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
        {errors.instructions && <p className="mt-1 text-sm text-red-600">{errors.instructions}</p>}
      </div>

      {/* Selfie requirements */}
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={selfieStart}
            onChange={(e) => setSelfieStart(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Require selfie at check-in
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={selfieEnd}
            onChange={(e) => setSelfieEnd(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Require selfie at check-out
        </label>
      </div>

      {syncNote && <p className="text-sm text-gray-500">{syncNote}</p>}
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
