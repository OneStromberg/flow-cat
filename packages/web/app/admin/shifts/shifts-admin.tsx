'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ShiftTemplate, Worker, RecurringAssignment, ShiftInstance } from '@scourage/worklog-core';

// Local stand-in until this file is migrated in a later task
export interface InstanceWithCount extends ShiftInstance {
  assignedCount: number;
}

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
};

// ── Recurring assignment editor (per template) ────────────────────────────────

function RecurringEditor({
  template,
  workers,
  recurring,
}: {
  template: ShiftTemplate;
  workers: Worker[];
  recurring: RecurringAssignment[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); // ponytail: bool; no per-action granularity needed
  const [addPhone, setAddPhone] = useState('');

  const activeRecurring = recurring.filter((r) => r.active);
  const assignedPhones = new Set(activeRecurring.map((r) => r.employeePhone));

  // Workers already assigned (by phone, resolved to name)
  const assignedWorkers = activeRecurring
    .map((r) => workers.find((w) => w.phone === r.employeePhone))
    .filter((w): w is Worker => Boolean(w));

  // Workers available to add (not currently assigned, active)
  const available = workers.filter((w) => w.active && !assignedPhones.has(w.phone));
  const members = available.filter((w) => w.places.includes(template.location));
  const others = available.filter((w) => !w.places.includes(template.location));

  async function postAction(action: 'addRecurring' | 'removeRecurring', phone: string) {
    setBusy(true);
    try {
      await fetch('/api/admin/shift-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, templateId: template.id, phone }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    if (!addPhone) return;
    setAddPhone('');
    await postAction('addRecurring', addPhone);
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recurring assignments</p>

      {assignedWorkers.length === 0 && (
        <p className="mt-1 text-xs text-gray-400">No recurring employees assigned.</p>
      )}

      {assignedWorkers.length > 0 && (
        <ul className="mt-2 space-y-1">
          {assignedWorkers.map((w) => (
            <li key={w.phone} className="flex items-center justify-between gap-2 text-sm">
              <span>{w.name}</span>
              <button
                onClick={() => postAction('removeRecurring', w.phone)}
                disabled={busy}
                className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add employee picker */}
      {available.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={addPhone}
            onChange={(e) => setAddPhone(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Add employee…</option>
            {members.length > 0 && (
              <optgroup label="Site members">
                {members.map((w) => (
                  <option key={w.phone} value={w.phone}>
                    {w.name}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Other workers">
                {others.map((w) => (
                  <option key={w.phone} value={w.phone}>
                    {w.name} (not a site member)
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            onClick={handleAdd}
            disabled={!addPhone || busy}
            className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ── Upcoming instances view (per template) ────────────────────────────────────

function InstancesView({ instances }: { instances: InstanceWithCount[] }) {
  if (instances.length === 0) {
    return <p className="mt-2 text-xs text-gray-400">No upcoming instances in the next 42 days.</p>;
  }

  const sorted = [...instances].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Upcoming instances</p>
      <ul className="mt-2 space-y-1">
        {sorted.map((inst) => {
          const needsStaff = inst.status !== 'cancelled' && inst.assignedCount < inst.headcount;
          return (
            <li key={inst.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
              <span className="w-24 text-gray-600">{inst.date}</span>
              <span className="text-gray-500">{inst.start}–{inst.end}</span>
              <span className={needsStaff ? 'font-medium text-red-600' : 'text-gray-600'}>
                {inst.assignedCount}/{inst.headcount}
              </span>
              {inst.status === 'cancelled' && (
                <span className="text-xs text-gray-400">(cancelled)</span>
              )}
              {needsStaff && <span className="text-xs text-amber-600">⚠ needs staff</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  templates: ShiftTemplate[];
  places: string[];
  workers: Worker[];
  recurringByTemplate: Record<string, RecurringAssignment[]>;
  instancesByTemplate: Record<string, InstanceWithCount[]>;
};

export function ShiftsAdmin({
  templates,
  places,
  workers,
  recurringByTemplate,
  instancesByTemplate,
}: Props) {
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
          <ul className="space-y-4">
            {templates.map((t) => (
              <li key={t.id} className="rounded-lg border border-gray-200 p-4">
                {/* Template header */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium">{t.location}</span>
                  <span className="text-gray-600">{t.label}</span>
                  <span className="text-gray-500">{t.days.join(', ')}</span>
                  <span className="text-gray-500">{t.start}–{t.end}</span>
                  <span className="text-gray-500">×{t.headcount}</span>
                  <span className="ml-auto text-xs text-gray-400">{t.validFrom} → {t.validTo}</span>
                </div>

                {/* Recurring assignment editor */}
                <RecurringEditor
                  template={t}
                  workers={workers}
                  recurring={recurringByTemplate[t.id] ?? []}
                />

                {/* Upcoming instances */}
                <InstancesView instances={instancesByTemplate[t.id] ?? []} />
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
