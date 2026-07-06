'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BrokenWorker } from '@scourage/worklog-core';

export function BrokenWorkerFix({ workers }: { workers: BrokenWorker[] }) {
  const router = useRouter();

  if (workers.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
      <h2 className="mb-3 font-semibold text-yellow-800">⚠ Needs phone fix ({workers.length})</h2>
      <ul className="space-y-3">
        {workers.map((w) => (
          <BrokenWorkerRow key={w.token || w.name} worker={w} onFixed={() => router.refresh()} />
        ))}
      </ul>
    </div>
  );
}

function BrokenWorkerRow({ worker, onFixed }: { worker: BrokenWorker; onFixed: () => void }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/workers/fix-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: worker.token, phone }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Save failed');
      } else {
        onFixed();
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{worker.name}</span>
      <span className="rounded bg-yellow-200 px-1.5 py-0.5 text-xs text-yellow-800">
        {worker.reason === 'blank' ? 'blank phone' : `duplicate: ${worker.phone}`}
      </span>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="New phone number"
        className="rounded border px-2 py-1 text-sm"
      />
      <button
        onClick={handleSave}
        disabled={saving || !phone.trim()}
        className="rounded bg-yellow-700 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </li>
  );
}
