'use client';

import { useState } from 'react';

export function ExportPhotosButton({ place }: { place: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/photos/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place, from: from || undefined, to: to || undefined }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? 'Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `photos ${place} ${from || 'all'}..${to || 'all'}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="rounded border border-gray-300 px-2 py-1 text-sm"
        aria-label="From date"
      />
      <span className="text-gray-400">–</span>
      <input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="rounded border border-gray-300 px-2 py-1 text-sm"
        aria-label="To date"
      />
      <button
        type="button"
        disabled={busy}
        onClick={handleExport}
        className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Exporting…' : 'Export photos'}
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
