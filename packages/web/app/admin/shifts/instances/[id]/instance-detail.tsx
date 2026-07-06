'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ShiftInstance, Worker } from '@scourage/worklog-core';
import type { AssignmentWithName } from './page';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  instance: ShiftInstance;
  assignments: AssignmentWithName[];
  workers: Worker[];
  role: string;
  instructions: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiPost(
  instanceId: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/admin/shift-instances/${instanceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: json.error ?? `HTTP ${res.status}` };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InstanceDetail({ instance, assignments, workers, role, instructions }: Props) {
  const router = useRouter();
  const cancelled = instance.status === 'cancelled';

  // ── Edit form state ────────────────────────────────────────────────────────
  const [editDate, setEditDate] = useState(instance.date);
  const [editStart, setEditStart] = useState(instance.start);
  const [editEnd, setEditEnd] = useState(instance.end);
  const [editHeadcount, setEditHeadcount] = useState(String(instance.headcount));
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    setEditLoading(true);
    const r = await apiPost(instance.id, {
      action: 'update',
      date: editDate,
      start: editStart,
      end: editEnd,
      headcount: editHeadcount,
    });
    setEditLoading(false);
    if (!r.ok) {
      setEditError(r.error ?? 'Save failed');
    } else {
      router.refresh();
    }
  }

  // ── Cancel-shift two-tap state ─────────────────────────────────────────────
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  async function handleCancel() {
    if (!cancelPending) {
      setCancelPending(true);
      return;
    }
    setCancelLoading(true);
    await apiPost(instance.id, { action: 'cancel' });
    setCancelLoading(false);
    setCancelPending(false);
    router.refresh();
  }

  // ── Add-employee picker state ──────────────────────────────────────────────
  const assignedPhones = new Set(assignments.map((a) => a.employeePhone));
  const availableWorkers = workers.filter(
    (w) => w.active && !assignedPhones.has(w.phone),
  );
  // ponytail: no state — derive from props so router.refresh() always reflects current list
  const [selectedPhone, setSelectedPhone] = useState('');
  const effectivePhone = assignedPhones.has(selectedPhone) || !selectedPhone
    ? (availableWorkers[0]?.phone ?? '')
    : selectedPhone;
  const [addLoading, setAddLoading] = useState(false);

  async function handleAdd() {
    if (!effectivePhone) return;
    setAddLoading(true);
    const r = await apiPost(instance.id, { action: 'assign', phone: effectivePhone });
    setAddLoading(false);
    if (r.ok) {
      router.refresh();
    }
  }

  // ── Remove-assignment ──────────────────────────────────────────────────────
  const [removingPhone, setRemovingPhone] = useState<string | null>(null);

  async function handleRemove(phone: string) {
    setRemovingPhone(phone);
    const r = await apiPost(instance.id, { action: 'remove', phone });
    setRemovingPhone(null);
    if (r.ok) {
      router.refresh();
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/admin/shifts"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        ‹ Back to shifts
      </Link>

      {/* Instance summary */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p
              className={[
                'text-lg font-semibold',
                cancelled ? 'text-gray-400 line-through' : 'text-gray-900',
              ].join(' ')}
            >
              {instance.location}
            </p>
            <p
              className={[
                'text-sm',
                cancelled ? 'text-gray-400 line-through' : 'text-gray-600',
              ].join(' ')}
            >
              {instance.date} · {instance.start}–{instance.end} · ×{instance.headcount}
            </p>
            {role && (
              <p className="mt-1 text-sm font-bold text-gray-800">{role}</p>
            )}
            {instructions && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                <span className="font-medium">Instructions: </span>{instructions}
              </p>
            )}
          </div>
          {cancelled && (
            <span className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
              CANCELLED
            </span>
          )}
        </div>
      </div>

      {/* Edit form */}
      {!cancelled && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Edit shift
          </h2>
          <form
            onSubmit={handleSave}
            className="space-y-3 rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Date
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Headcount
                </label>
                <input
                  type="number"
                  min={1}
                  value={editHeadcount}
                  onChange={(e) => setEditHeadcount(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Start
                </label>
                <input
                  type="time"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  End
                </label>
                <input
                  type="time"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  required
                />
              </div>
            </div>

            {editError && (
              <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-600">
                {editError}
              </p>
            )}

            <button
              type="submit"
              disabled={editLoading}
              className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {editLoading ? 'Saving…' : 'Save'}
            </button>
          </form>
        </section>
      )}

      {/* Assignments */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Assignments
        </h2>
        <div className="rounded-lg border border-gray-200 bg-white">
          {assignments.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">No assignments yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {assignments.map((a) => (
                <li
                  key={a.employeePhone}
                  className="flex items-center justify-between gap-2 px-4 py-2.5"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-800">
                      {a.workerName}
                    </span>
                    {a.source !== 'manual' && (
                      <span className="ml-2 text-xs text-gray-400">({a.source})</span>
                    )}
                  </div>
                  {!cancelled && (
                    <button
                      onClick={() => handleRemove(a.employeePhone)}
                      disabled={removingPhone === a.employeePhone}
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {removingPhone === a.employeePhone ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Add employee */}
          {!cancelled && availableWorkers.length > 0 && (
            <div className="flex gap-2 border-t border-gray-100 p-3">
              <select
                value={effectivePhone}
                onChange={(e) => setSelectedPhone(e.target.value)}
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                {availableWorkers.map((w) => (
                  <option key={w.phone} value={w.phone}>
                    {w.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAdd}
                disabled={addLoading || !effectivePhone}
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {addLoading ? 'Adding…' : 'Add'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Cancel shift */}
      {!cancelled && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Danger zone
          </h2>
          <div className="rounded-lg border border-red-200 bg-white p-4">
            {cancelPending ? (
              <div className="space-y-2">
                <p className="text-sm text-red-700">
                  This will cancel the shift for all assigned workers. Are you sure?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={cancelLoading}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {cancelLoading ? 'Cancelling…' : 'Tap again to confirm'}
                  </button>
                  <button
                    onClick={() => setCancelPending(false)}
                    disabled={cancelLoading}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
                  >
                    Never mind
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleCancel}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Cancel shift
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
