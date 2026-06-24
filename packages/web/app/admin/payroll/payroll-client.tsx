'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Worker } from '@scourage/worklog-core';

interface PayrollRow {
  phone: string;
  name: string;
  structure: string;
  hours: number;
  gross: number;
  bonuses: number;
  penalties: number;
  net: number;
}

interface Props {
  rows: PayrollRow[];
  workers: Pick<Worker, 'phone' | 'name'>[];
  from: string;
  to: string;
}

function fmt(n: number): string {
  return '₪' + n.toFixed(2);
}

export function PayrollClient({ rows, workers, from, to }: Props) {
  const router = useRouter();

  const [adjPhone, setAdjPhone] = useState('');
  const [adjType, setAdjType] = useState<'bonus' | 'penalty'>('bonus');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjDate, setAdjDate] = useState(from);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');

  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalBonuses = rows.reduce((s, r) => s + r.bonuses, 0);
  const totalPenalties = rows.reduce((s, r) => s + r.penalties, 0);
  const totalNet = rows.reduce((s, r) => s + r.net, 0);

  async function handleAddAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setServerError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeePhone: adjPhone,
          date: adjDate,
          type: adjType,
          amount: adjAmount,
          reason: adjReason,
        }),
      });

      const data = await res.json();

      if (res.status === 400 && data.errors) {
        setFieldErrors(data.errors as Record<string, string>);
        return;
      }
      if (!res.ok) {
        setServerError(data.error ?? 'Failed to save adjustment');
        return;
      }

      // Reset form
      setAdjPhone('');
      setAdjType('bonus');
      setAdjAmount('');
      setAdjReason('');
      setAdjDate(from);
      router.refresh();
    } catch {
      setServerError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Date range filter */}
      <form method="GET" className="flex items-center gap-3">
        <label className="text-sm text-gray-600">From</label>
        <input
          type="date"
          name="from"
          defaultValue={from}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <label className="text-sm text-gray-600">To</label>
        <input
          type="date"
          name="to"
          defaultValue={to}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-gray-800 px-3 py-1 text-sm text-white"
        >
          Apply
        </button>
      </form>

      {/* Payroll table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">Worker</th>
              <th className="pr-4">Structure</th>
              <th className="pr-4 text-right">Hours</th>
              <th className="pr-4 text-right">Gross</th>
              <th className="pr-4 text-right">Bonuses</th>
              <th className="pr-4 text-right">Penalties</th>
              <th className="text-right font-semibold">Net ₪</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.phone} className="border-b">
                <td className="py-2 pr-4 font-medium">{row.name}</td>
                <td className="pr-4 text-gray-600">{row.structure}</td>
                <td className="pr-4 text-right">{row.hours.toFixed(2)}</td>
                <td className="pr-4 text-right">{fmt(row.gross)}</td>
                <td className="pr-4 text-right text-green-700">{fmt(row.bonuses)}</td>
                <td className="pr-4 text-right text-red-600">{fmt(row.penalties)}</td>
                <td className="text-right font-semibold">{fmt(row.net)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-gray-500">
                  No active workers for this period.
                </td>
              </tr>
            )}
            {rows.length > 0 && (
              <tr className="border-t-2 bg-gray-50 font-semibold">
                <td className="py-2 pr-4">Total</td>
                <td className="pr-4" />
                <td className="pr-4 text-right">
                  {rows.reduce((s, r) => s + r.hours, 0).toFixed(2)}
                </td>
                <td className="pr-4 text-right">{fmt(totalGross)}</td>
                <td className="pr-4 text-right text-green-700">{fmt(totalBonuses)}</td>
                <td className="pr-4 text-right text-red-600">{fmt(totalPenalties)}</td>
                <td className="text-right">{fmt(totalNet)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add adjustment */}
      <div className="rounded-lg border border-gray-200 p-4">
        <h2 className="mb-4 text-base font-semibold">Add Adjustment</h2>
        {serverError && (
          <p className="mb-3 text-sm text-red-600">{serverError}</p>
        )}
        <form onSubmit={handleAddAdjustment} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-gray-600">Worker</label>
            <select
              value={adjPhone}
              onChange={(e) => setAdjPhone(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">— select worker —</option>
              {workers.map((w) => (
                <option key={w.phone} value={w.phone}>
                  {w.name}
                </option>
              ))}
            </select>
            {fieldErrors.employeePhone && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.employeePhone}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">Type</label>
            <select
              value={adjType}
              onChange={(e) => setAdjType(e.target.value as 'bonus' | 'penalty')}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="bonus">Bonus</option>
              <option value="penalty">Penalty</option>
            </select>
            {fieldErrors.type && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.type}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">Amount (₪)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            {fieldErrors.amount && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.amount}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">Date</label>
            <input
              type="date"
              value={adjDate}
              onChange={(e) => setAdjDate(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            {fieldErrors.date && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.date}</p>
            )}
          </div>

          <div className="sm:col-span-2 lg:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">Reason</label>
            <input
              type="text"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="Enter reason…"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            {fieldErrors.reason && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.reason}</p>
            )}
          </div>

          <div className="flex items-end lg:col-span-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Add Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
