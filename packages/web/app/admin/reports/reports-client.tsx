'use client';
import { useState } from 'react';

type ReportType = 'hours_employee' | 'hours_location' | 'payroll' | 'exceptions';

const REPORT_LABELS: Record<ReportType, string> = {
  hours_employee: 'Hours by Employee',
  hours_location: 'Hours by Location',
  payroll: 'Payroll Summary',
  exceptions: 'Attendance Exceptions',
};

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1, 0)) };
}

function buildCsv(header: string[], rows: string[][]): string {
  const escape = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  const lines = [header, ...rows].map((row) => row.map(escape).join(','));
  return lines.join('\r\n');
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ReportResult {
  tab: string;
  header: string[];
  rows: string[][];
}

export function ReportsClient() {
  const defaults = currentMonthRange();
  const [type, setType] = useState<ReportType>('hours_employee');
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, from, to }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Failed to generate report');
      } else {
        setResult({ tab: data.tab, header: data.header, rows: data.rows });
      }
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Report type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ReportType)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {(Object.entries(REPORT_LABELS) as [ReportType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Written to sheet tab <strong>{result.tab}</strong>
          </div>

          <button
            onClick={() => downloadCsv(`${result.tab}.csv`, buildCsv(result.header, result.rows))}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Download CSV
          </button>

          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {result.header.map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {result.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={result.header.length}
                      className="px-4 py-4 text-center text-gray-400"
                    >
                      No data
                    </td>
                  </tr>
                ) : (
                  result.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className="px-4 py-2 text-gray-700">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
