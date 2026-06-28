'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Worker, Leave } from '@scourage/worklog-core';

interface LeaveWithName extends Leave {
  workerName: string;
}

interface LeaveType {
  value: string;
  label: string;
}

interface Props {
  leaves: LeaveWithName[];
  workers: Pick<Worker, 'phone' | 'name'>[];
  types: LeaveType[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
};

export function LeaveClient({ leaves, workers, types }: Props) {
  const router = useRouter();

  // Add form state
  const [phone, setPhone] = useState('');
  const [type, setType] = useState(types[0]?.value ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setServerError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', employeePhone: phone, type, from, to, reason }),
      });
      const data = await res.json();
      if (res.status === 400 && data.errors) {
        setFieldErrors(data.errors as Record<string, string>);
        return;
      }
      if (!res.ok) {
        setServerError(data.error ?? 'Failed to save');
        return;
      }
      setPhone('');
      setType(types[0]?.value ?? '');
      setFrom('');
      setTo('');
      setReason('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatus(id: string, status: 'approved' | 'denied') {
    const res = await fetch('/api/admin/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setStatus', id, status }),
    });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* Add Leave Form */}
      <section>
        <h2 className="text-base font-medium mb-3">Add Leave Request</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Worker</label>
            <select
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
              required
            >
              <option value="">Select worker…</option>
              {workers.map((w) => (
                <option key={w.phone} value={w.phone}>{w.name}</option>
              ))}
            </select>
            {fieldErrors.employeePhone && (
              <p className="text-red-600 text-xs mt-0.5">{fieldErrors.employeePhone}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              {types.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {fieldErrors.type && (
              <p className="text-red-600 text-xs mt-0.5">{fieldErrors.type}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
                required
              />
              {fieldErrors.from && (
                <p className="text-red-600 text-xs mt-0.5">{fieldErrors.from}</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
                required
              />
              {fieldErrors.to && (
                <p className="text-red-600 text-xs mt-0.5">{fieldErrors.to}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
              placeholder="Optional"
            />
          </div>

          {serverError && <p className="text-red-600 text-xs">{serverError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Add Leave'}
          </button>
        </form>
      </section>

      {/* Leave List */}
      <section>
        <h2 className="text-base font-medium mb-3">All Leave ({leaves.length})</h2>
        {leaves.length === 0 ? (
          <p className="text-sm text-gray-500">No leave records.</p>
        ) : (
          <div className="space-y-3">
            {leaves.map((l) => (
              <div key={l.id} className="border rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{l.workerName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[l.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {l.status}
                  </span>
                </div>
                <div className="text-xs text-gray-600">
                  {l.type} · {l.from} – {l.to}
                </div>
                {l.reason && <div className="text-xs text-gray-500">{l.reason}</div>}
                {l.status === 'pending' && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleStatus(l.id, 'approved')}
                      className="flex-1 bg-green-600 text-white text-xs rounded py-1.5 font-medium"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleStatus(l.id, 'denied')}
                      className="flex-1 bg-red-600 text-white text-xs rounded py-1.5 font-medium"
                    >
                      Deny
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
