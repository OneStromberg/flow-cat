'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [teudatZeut, setTeudatZeut] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, teudatZeut }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        router.replace('/');
        router.refresh();
      } else {
        setError(data.error ?? 'Login failed.');
        setBusy(false);
      }
    } catch {
      setError('Network error, try again.');
      setBusy(false);
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <div>
        <label className="block text-sm font-medium text-gray-700">Phone</label>
        <input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base" type="tel"
          value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Teudat zeut</label>
        <input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base" type="text"
          inputMode="numeric" value={teudatZeut} onChange={(e) => setTeudatZeut(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
        {busy ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}
