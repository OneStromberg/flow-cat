'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ShiftTemplate, Worker, RecurringAssignment } from '@scourage/worklog-core';
import type { InstanceWithCount } from './page';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base';
const labelClass = 'block text-sm font-medium text-gray-700';

// ── Edit form ─────────────────────────────────────────────────────────────────

type FormFields = {
  location: string;
  label: string;
  start: string;
  end: string;
  headcount: string;
  rate: string;
  validFrom: string;
  validTo: string;
};

function EditTemplateForm({
  template,
  places,
}: {
  template: ShiftTemplate;
  places: string[];
}) {
  const router = useRouter();
  const [v, setV] = useState<FormFields>({
    location: template.location,
    label: template.label,
    start: template.start,
    end: template.end,
    headcount: String(template.headcount),
    rate: template.rate != null ? String(template.rate) : '',
    validFrom: template.validFrom ?? '',
    validTo: template.validTo ?? '',
  });
  const [days, setDays] = useState<string[]>([...template.days]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (k: keyof FormFields, val: string) => setV((p) => ({ ...p, [k]: val }));
  const toggleDay = (d: string) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFatal(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/shifts/${template.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, days }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSaved(true);
        router.refresh();
      } else if (res.status === 400 && data.errors) {
        setErrors(data.errors);
      } else {
        setFatal('Could not save. Please try again.');
      }
    } catch {
      setFatal('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <h2 className="text-base font-semibold text-gray-800">Edit template</h2>
      <form className="mt-3 space-y-4" onSubmit={submit}>
        {/* Location */}
        <div>
          <label className={labelClass}>Location</label>
          <select className={inputClass} value={v.location} onChange={(e) => set('location', e.target.value)}>
            <option value="">Choose…</option>
            {places.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {errors.location && <p className="mt-1 text-sm text-red-600">{errors.location}</p>}
        </div>

        {/* Label */}
        <div>
          <label className={labelClass}>Label</label>
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
          <label className={labelClass}>Days</label>
          <div className="mt-1 flex flex-wrap gap-3">
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
            <label className={labelClass}>Start</label>
            <input
              className={inputClass}
              type="time"
              value={v.start}
              onChange={(e) => set('start', e.target.value)}
            />
            {errors.start && <p className="mt-1 text-sm text-red-600">{errors.start}</p>}
          </div>
          <div>
            <label className={labelClass}>End</label>
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
          <label className={labelClass}>Headcount</label>
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
          <label className={labelClass}>Rate (optional)</label>
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
            <label className={labelClass}>Valid from</label>
            <input
              className={inputClass}
              type="date"
              value={v.validFrom}
              onChange={(e) => set('validFrom', e.target.value)}
            />
            {errors.validFrom && <p className="mt-1 text-sm text-red-600">{errors.validFrom}</p>}
          </div>
          <div>
            <label className={labelClass}>Valid to</label>
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
        {saved && <p className="text-sm text-green-600">Saved.</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </section>
  );
}

// ── Recurring assignments editor ──────────────────────────────────────────────

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
  const [busy, setBusy] = useState(false);
  const [addPhone, setAddPhone] = useState('');

  const activeRecurring = recurring.filter((r) => r.active);
  const assignedPhones = new Set(activeRecurring.map((r) => r.employeePhone));

  const assignedWorkers = activeRecurring
    .map((r) => workers.find((w) => w.phone === r.employeePhone))
    .filter((w): w is Worker => Boolean(w));

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
    const phone = addPhone;
    setAddPhone('');
    await postAction('addRecurring', phone);
  }

  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <h2 className="text-base font-semibold text-gray-800">Recurring assignments</h2>

      {assignedWorkers.length === 0 && (
        <p className="mt-2 text-sm text-gray-400">No recurring employees assigned.</p>
      )}

      {assignedWorkers.length > 0 && (
        <ul className="mt-3 space-y-1.5">
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

      {available.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <select
            value={addPhone}
            onChange={(e) => setAddPhone(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="">Add employee…</option>
            {members.length > 0 && (
              <optgroup label="Site members">
                {members.map((w) => (
                  <option key={w.phone} value={w.phone}>{w.name}</option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Other workers">
                {others.map((w) => (
                  <option key={w.phone} value={w.phone}>{w.name} (not a site member)</option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            onClick={handleAdd}
            disabled={!addPhone || busy}
            className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </section>
  );
}

// ── Copy to period ────────────────────────────────────────────────────────────

function CopyToPeriod({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [carryAssignments, setCarryAssignments] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCopy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/shifts/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, validFrom, validTo, carryAssignments }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.id) {
          router.push(`/admin/shifts/templates/${data.id}`);
        } else {
          router.push('/admin/shifts/templates');
        }
      } else {
        setError(
          data.errors
            ? Object.values(data.errors as Record<string, string>).join(', ')
            : 'Copy failed. Please try again.',
        );
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <h2 className="text-base font-semibold text-gray-800">Copy to period</h2>
      <p className="mt-1 text-sm text-gray-500">
        Creates a new template with the same settings but different valid dates.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Valid from</label>
          <input
            className={inputClass}
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Valid to</label>
          <input
            className={inputClass}
            type="date"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
          />
        </div>
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={carryAssignments}
          onChange={(e) => setCarryAssignments(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        Carry recurring assignments to new template
      </label>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        onClick={handleCopy}
        disabled={!validFrom || !validTo || busy}
        className="mt-4 w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Copying…' : 'Copy template'}
      </button>
    </section>
  );
}

// ── Upcoming instances ────────────────────────────────────────────────────────

function UpcomingInstances({ instances }: { instances: InstanceWithCount[] }) {
  const sorted = [...instances].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <h2 className="text-base font-semibold text-gray-800">Upcoming instances (42 days)</h2>
      {sorted.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">No upcoming instances in the next 42 days.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {sorted.map((inst) => {
            const needsStaff = inst.status !== 'cancelled' && inst.assignedCount < inst.headcount;
            return (
              <li key={inst.id}>
                <Link
                  href={`/admin/shifts/instances/${inst.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{inst.date}</span>
                    <span className="text-gray-500">{inst.start}–{inst.end}</span>
                    {inst.status === 'cancelled' && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">cancelled</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${needsStaff ? 'text-amber-600 font-medium' : 'text-gray-500'}`}>
                      {inst.assignedCount}/{inst.headcount}
                    </span>
                    {needsStaff && (
                      <span title="Needs staff" className="text-amber-500">⚠</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export function TemplateDetail({
  template,
  places,
  workers,
  recurring,
  instances,
}: {
  template: ShiftTemplate;
  places: string[];
  workers: Worker[];
  recurring: RecurringAssignment[];
  instances: InstanceWithCount[];
}) {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-5">
      {/* Back link */}
      <div className="flex items-center gap-3">
        <Link href="/admin/shifts/templates" className="text-sm text-gray-500 hover:text-gray-800">
          ‹ Back to shifts
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {template.location} — {template.label}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {template.days.join(', ')} · {template.start}–{template.end} · ×{template.headcount}
          {!template.active && ' · (inactive)'}
        </p>
      </div>

      <EditTemplateForm template={template} places={places} />
      <RecurringEditor template={template} workers={workers} recurring={recurring} />
      <CopyToPeriod templateId={template.id} />
      <UpcomingInstances instances={instances} />
    </main>
  );
}
