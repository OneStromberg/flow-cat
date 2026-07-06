'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ShiftTemplate, Worker, RecurringAssignment } from '@scourage/worklog-core';
import type { InstanceWithCount } from './page';

const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base';
const labelClass = 'block text-sm font-medium text-gray-700';
const smInp = 'rounded-lg border border-gray-300 px-2 py-2 text-base';

// ── Edit form ─────────────────────────────────────────────────────────────────

const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
type Day = (typeof DAY_ORDER)[number];
type SlotState = { start: string; end: string };
type DayState = { on: boolean; slots: SlotState[] };
type DayGrid = Record<Day, DayState>;
type RecurMode = 'forever' | 'nweeks' | 'fromto';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function initGrid(template: ShiftTemplate): DayGrid {
  const daySlots = new Map<string, SlotState[]>();
  for (const dt of template.dayTimes) {
    const prev = daySlots.get(dt.day) ?? [];
    daySlots.set(dt.day, [...prev, { start: dt.start, end: dt.end }]);
  }
  return Object.fromEntries(
    DAY_ORDER.map((d) => {
      const slots = daySlots.get(d);
      return [d, { on: Boolean(slots), slots: slots ?? [{ start: '', end: '' }] }];
    }),
  ) as DayGrid;
}

function initRecur(template: ShiftTemplate): { mode: RecurMode; startDate: string; fromDate: string; toDate: string; nWeeks: string } {
  const hasTo = Boolean(template.validTo);
  if (hasTo) {
    return { mode: 'fromto', startDate: todayStr(), fromDate: template.validFrom || todayStr(), toDate: template.validTo, nWeeks: '4' };
  }
  return { mode: 'forever', startDate: template.validFrom || todayStr(), fromDate: todayStr(), toDate: '', nWeeks: '4' };
}

function EditTemplateForm({
  template,
  places,
}: {
  template: ShiftTemplate;
  places: string[];
}) {
  const router = useRouter();

  // base fields
  const [location, setLocation] = useState(template.location);
  const [label, setLabel] = useState(template.label);
  const [headcount, setHeadcount] = useState(String(template.headcount));
  const [rate, setRate] = useState(template.rate != null ? String(template.rate) : '');
  const [instructions, setInstructions] = useState(template.instructions ?? '');

  // per-day grid — prefilled from template.dayTimes
  const [grid, setGrid] = useState<DayGrid>(() => initGrid(template));
  const [defStart, setDefStart] = useState('09:00');
  const [defEnd, setDefEnd] = useState('17:00');

  // recurrence — inferred from validFrom/validTo
  const initR = initRecur(template);
  const [recurMode, setRecurMode] = useState<RecurMode>(initR.mode);
  const [startDate, setStartDate] = useState(initR.startDate);
  const [nWeeks, setNWeeks] = useState(initR.nWeeks);
  const [fromDate, setFromDate] = useState(initR.fromDate);
  const [toDate, setToDate] = useState(initR.toDate);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncNote, setSyncNote] = useState(false);

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
    setSaved(false);

    const enabled = DAY_ORDER.filter((d) => grid[d].on);
    const clientErrors: Record<string, string> = {};
    if (enabled.length === 0) clientErrors.dayTimes = 'Select at least one day.';
    for (const d of enabled) {
      for (const slot of grid[d].slots) {
        if (!slot.start || !slot.end)
          clientErrors.dayTimes = `${d} has a slot missing a start or end time.`;
      }
    }
    if (Object.keys(clientErrors).length) { setErrors(clientErrors); return; }

    const dayTimes = enabled.flatMap((d) => grid[d].slots.map((s) => ({ day: d, start: s.start, end: s.end })));
    const { validFrom, validTo } = getDateRange();

    setBusy(true);
    try {
      const res = await fetch(`/api/admin/shifts/${template.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, label, headcount, rate, instructions, validFrom, validTo, dayTimes }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSaved(true);
        if (data.seedWarning) setSyncNote(true);
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
          <select className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)}>
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
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          {errors.label && <p className="mt-1 text-sm text-red-600">{errors.label}</p>}
        </div>

        {/* Per-day weekday grid */}
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Schedule</legend>
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
                      <input
                        type="time"
                        value={slot.start}
                        disabled={!row.on}
                        onChange={(e) => setSlotField(day, idx, 'start', e.target.value)}
                        className={smInp + ' w-full disabled:opacity-40'}
                        aria-label={`${day} shift ${idx + 1} start`}
                      />
                      <span className="shrink-0 text-xs text-gray-400">–</span>
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
            className={inputClass}
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
                className={inputClass}
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
                    className={inputClass}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="w-24">
                  <label className="block text-sm text-gray-600">Weeks</label>
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
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
                  className={inputClass}
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
                {errors.validFrom && <p className="mt-1 text-sm text-red-600">{errors.validFrom}</p>}
              </div>
              <div>
                <label className="block text-sm text-gray-600">To</label>
                <input
                  type="date"
                  className={inputClass}
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
          <label className={labelClass}>Headcount</label>
          <input
            className={inputClass}
            type="number"
            min={1}
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
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
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          {errors.rate && <p className="mt-1 text-sm text-red-600">{errors.rate}</p>}
        </div>

        {/* Instructions */}
        <div>
          <label className={labelClass}>Instructions (tasks for this role)</label>
          <textarea
            className={inputClass}
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          {errors.instructions && <p className="mt-1 text-sm text-red-600">{errors.instructions}</p>}
        </div>

        {fatal && <p className="text-sm text-red-600">{fatal}</p>}
        {saved && <p className="text-sm text-green-600">Saved.</p>}
        {syncNote && <p className="text-sm text-gray-500">Staffing is syncing — refresh in a moment.</p>}
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
  const [syncNote, setSyncNote] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
    setActionError(null);
    try {
      const res = await fetch('/api/admin/shift-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, templateId: template.id, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((data as { error?: string }).error ?? 'Action failed. Please try again.');
        return;
      }
      if ((data as { seedWarning?: boolean }).seedWarning) setSyncNote(true);
      router.refresh();
    } catch {
      setActionError('Network error. Please try again.');
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
      {syncNote && (
        <p className="mt-2 text-sm text-gray-500">Saved. Staffing is syncing — refresh in a moment.</p>
      )}
      {actionError && (
        <p className="mt-2 text-sm text-red-600">{actionError}</p>
      )}
    </section>
  );
}

// ── Copy to another location ──────────────────────────────────────────────────

function CopyToLocation({ template, places }: { template: ShiftTemplate; places: string[] }) {
  const router = useRouter();
  const otherPlaces = places.filter((p) => p !== template.location);
  const [location, setLocation] = useState(otherPlaces[0] ?? '');
  const [carryAssignments, setCarryAssignments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  async function handleCopy() {
    setBusy(true);
    setError(null);
    setSyncNote(null);
    try {
      const res = await fetch('/api/admin/shifts/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id, location, carryAssignments }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.seedWarning) {
          setSyncNote('Saved. Staffing is syncing — refresh in a moment.');
          setTimeout(() => router.push(`/admin/shifts/templates/${data.id}`), 1800);
        } else {
          router.push(`/admin/shifts/templates/${data.id}`);
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
      <h2 className="text-base font-semibold text-gray-800">Copy to another location</h2>
      <p className="mt-1 text-sm text-gray-500">
        Creates a new template with the same schedule at a different location.
      </p>
      <div className="mt-3">
        <label className={labelClass}>Location</label>
        <select
          className={inputClass}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        >
          <option value="">Choose…</option>
          {otherPlaces.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
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
      {syncNote && <p className="mt-2 text-sm text-gray-500">{syncNote}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        onClick={handleCopy}
        disabled={!location || busy}
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

// ── Delete button ─────────────────────────────────────────────────────────────

function DeleteTemplateButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm('Delete this template? It will stop generating new shifts.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/shifts/templates/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/admin/shifts/templates');
        router.refresh();
      } else {
        alert('Delete failed. Please try again.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
    >
      {busy ? 'Deleting…' : 'Delete template'}
    </button>
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
      <div className="flex items-center justify-between">
        <Link href="/admin/shifts/templates" className="text-sm text-gray-500 hover:text-gray-800">
          ‹ Back to shifts
        </Link>
        <DeleteTemplateButton id={template.id} />
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
      <CopyToLocation template={template} places={places} />
      <UpcomingInstances instances={instances} />
    </main>
  );
}
