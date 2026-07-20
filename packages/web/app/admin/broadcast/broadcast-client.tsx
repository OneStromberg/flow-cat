'use client';

import { useMemo, useState } from 'react';
import type { Worker } from '@scourage/worklog-core';
import { filterWorkers, type WorkerFilters } from '../../../lib/filter-workers';
import { MultiSelectDropdown } from '../../components/multi-select-dropdown';

type EnumOpt = readonly { value: string; label: string }[];

type ShiftSlim = { id: string; location: string; date: string; start: string; end: string; headcount: number };

type DayTimeSlim = { day: string; start: string; end: string };
type TemplateSlim = { id: string; location: string; label: string; validFrom: string; dayTimes: DayTimeSlim[] };

type Props = {
  workers: Worker[];
  cities: string[];
  places: string[];
  shifts: ShiftSlim[];
  templates: TemplateSlim[];
  enums: { gender: EnumOpt; transportation: EnumOpt; hebrewLevel: EnumOpt; payType: EnumOpt; schedule: EnumOpt };
};

const EMPTY: WorkerFilters = {
  search: '',
  cities: [],
  transportation: [],
  hebrewLevel: [],
  payType: [],
  schedule: [],
  places: [],
  active: 'all',
  ageMin: '',
  ageMax: '',
  gender: [],
};

const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function renderScheduleLines(dayTimes: DayTimeSlim[]): string[] {
  if (!dayTimes.length) return [];
  const byDay = new Map<string, DayTimeSlim[]>();
  for (const dt of dayTimes) {
    const key = dt.day.toLowerCase();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(dt);
  }
  const sorted = [...byDay.keys()].sort((a, b) => {
    const ai = WEEK_ORDER.indexOf(a);
    const bi = WEEK_ORDER.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  return sorted.map((dayKey) => {
    const slots = byDay.get(dayKey)!;
    const display = dayKey.charAt(0).toUpperCase() + dayKey.slice(1);
    const times = slots.map((s) => `${s.start}–${s.end}`).join(', ');
    return `  ${display}: ${times}`;
  });
}

export function BroadcastClient({ workers, cities, places, shifts, templates, enums }: Props) {
  const [f, setF] = useState<WorkerFilters>(EMPTY);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  // Template broadcast state
  const [tplId, setTplId] = useState('');
  const [tplStatus, setTplStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tplSending, setTplSending] = useState(false);

  const filtered = useMemo(() => filterWorkers(workers, f), [workers, f]);
  const linked = useMemo(
    () => filtered.filter((w: Worker) => (w.telegramChatId ?? '').trim() !== ''),
    [filtered],
  );

  const cityOpts = cities.map((c) => ({ value: c, label: c }));
  const placeOpts = places.map((p) => ({ value: p, label: p }));

  const canSend = message.trim().length > 0 && filtered.length > 0 && !sending;
  const selectedTpl = templates.find((t) => t.id === tplId) ?? null;
  const canSendTpl = !!selectedTpl && linked.length > 0 && !tplSending;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, ...f }),
      });
      const data = (await res.json()) as { sent?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      setStatus({ type: 'success', text: `Sent to ${data.sent ?? 0} of ${filtered.length}` });
      setMessage('');
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send' });
    } finally {
      setSending(false);
    }
  }

  async function handleSendTpl() {
    if (!canSendTpl) return;
    setTplSending(true);
    setTplStatus(null);
    try {
      const res = await fetch('/api/admin/broadcast/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: tplId, ...f }),
      });
      const data = (await res.json()) as { sent?: number; matched?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      setTplStatus({ type: 'success', text: `Sent to ${data.sent ?? 0} workers` });
    } catch (err) {
      setTplStatus({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send' });
    } finally {
      setTplSending(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Compose from shift */}
      {shifts.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Compose from shift</label>
          <select
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            defaultValue=""
            onChange={(e) => {
              const shift = shifts.find((s) => s.id === e.target.value);
              if (!shift) return;
              setMessage(
                `Shift available: ${shift.location}, ${shift.date} ${shift.start}–${shift.end} (${shift.headcount} needed). Reply if you can cover.`,
              );
            }}
          >
            <option value="">— compose from a shift —</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.date} · {s.location} · {s.start}–{s.end} · {s.headcount}x
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Message */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Message</label>
        <textarea
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          rows={5}
          placeholder="Type your Telegram message…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      {/* Segment filters */}
      <div className="space-y-3 rounded-lg border border-gray-200 p-4">
        <p className="text-xs font-medium uppercase text-gray-500">Filter recipients</p>
        <div className="grid grid-cols-2 gap-2">
          <MultiSelectDropdown label="Transportation" options={[...enums.transportation]} selected={f.transportation} onChange={(v) => setF((p) => ({ ...p, transportation: v }))} />
          <MultiSelectDropdown label="Hebrew level" options={[...enums.hebrewLevel]} selected={f.hebrewLevel} onChange={(v) => setF((p) => ({ ...p, hebrewLevel: v }))} />
          <MultiSelectDropdown label="Pay" options={[...enums.payType]} selected={f.payType} onChange={(v) => setF((p) => ({ ...p, payType: v }))} />
          <MultiSelectDropdown label="Schedule" options={[...enums.schedule]} selected={f.schedule} onChange={(v) => setF((p) => ({ ...p, schedule: v }))} />
          <MultiSelectDropdown label="Gender" options={[...enums.gender]} selected={f.gender} onChange={(v) => setF((p) => ({ ...p, gender: v }))} />
          {cityOpts.length > 0 && <MultiSelectDropdown label="City" options={cityOpts} selected={f.cities} onChange={(v) => setF((p) => ({ ...p, cities: v }))} />}
          {placeOpts.length > 0 && <MultiSelectDropdown label="Places" options={placeOpts} selected={f.places} onChange={(v) => setF((p) => ({ ...p, places: v }))} />}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm">Active
            <select
              className="mt-1 block rounded-lg border border-gray-300 px-2 py-1 text-sm"
              value={f.active}
              onChange={(e) => setF((p) => ({ ...p, active: e.target.value as WorkerFilters['active'] }))}
            >
              <option value="all">All</option>
              <option value="yes">Active</option>
              <option value="no">Inactive</option>
            </select>
          </label>
          <button type="button" className="ml-auto text-sm text-gray-500 underline" onClick={() => setF(EMPTY)}>
            Clear
          </button>
        </div>
      </div>

      {/* Live recipient preview */}
      <div className="rounded-lg bg-gray-50 p-3 text-sm">
        <p>
          <strong>{filtered.length}</strong> workers match ·{' '}
          <strong>{linked.length}</strong> have Telegram linked
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Only workers who&apos;ve connected Telegram (Profile → Connect) will receive this.
        </p>
      </div>

      {/* Status message (free-text broadcast) */}
      {status && (
        <p className={`rounded-lg px-3 py-2 text-sm ${status.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {status.text}
        </p>
      )}

      {/* Send button (free-text broadcast) */}
      <button
        type="button"
        disabled={!canSend}
        onClick={handleSend}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
      >
        {sending ? 'Sending…' : `Send to ${filtered.length} worker${filtered.length !== 1 ? 's' : ''}`}
      </button>

      {/* Broadcast a template */}
      {templates.length > 0 && (
        <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-sm font-semibold text-indigo-900">📋 Broadcast a template</p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Pick template</label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              value={tplId}
              onChange={(e) => { setTplId(e.target.value); setTplStatus(null); }}
            >
              <option value="">— select a template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.location}{t.label ? ` — ${t.label}` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedTpl && (
            <div className="rounded-lg border border-indigo-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">
              {[
                '🆕 Доступна новая смена',
                `Location: ${selectedTpl.location}`,
                ...(selectedTpl.label ? [`Label: ${selectedTpl.label}`] : []),
                ...(selectedTpl.validFrom ? [`From: ${selectedTpl.validFrom}`] : []),
                ...(selectedTpl.dayTimes.length > 0 ? ['Schedule:', ...renderScheduleLines(selectedTpl.dayTimes)] : []),
              ].join('\n')}
            </div>
          )}

          {tplStatus && (
            <p className={`rounded-lg px-3 py-2 text-sm ${tplStatus.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {tplStatus.text}
            </p>
          )}

          <button
            type="button"
            disabled={!canSendTpl}
            onClick={handleSendTpl}
            className="w-full rounded-lg bg-indigo-700 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {tplSending ? 'Sending…' : `Send offer to ${linked.length} worker${linked.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}
