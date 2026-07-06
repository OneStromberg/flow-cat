'use client';

import { useState } from 'react';

type EnumOpt = readonly { value: string; label: string }[];
type Props = {
  cities: string[];
  enums: {
    transportation: EnumOpt;
    hebrewLevel: EnumOpt;
    schedule: EnumOpt;
    gender: EnumOpt;
  };
};

const FIELDS0 = {
  phone: '',
  teudatZeut: '',
  name: '',
  city: '',
  age: '',
  transportation: '',
  hebrewLevel: '',
  schedule: '',
  gender: '',
};

export function RegisterForm({ cities, enums }: Props) {
  const [v, setV] = useState({ ...FIELDS0 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = (k: keyof typeof FIELDS0, val: string) => setV((p) => ({ ...p, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFatal(null);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSuccess(true);
      } else if (res.status === 400 && data.errors) {
        setErrors(data.errors);
        setBusy(false);
      } else {
        setFatal('Could not register. Please try again.');
        setBusy(false);
      }
    } catch {
      setFatal('Network error. Please try again.');
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="mt-6 space-y-4">
        <p className="text-green-700 font-medium">✓ Registered — you can now log in</p>
        <a href="/login" className="block w-full rounded-lg bg-gray-900 px-4 py-3 text-center text-base font-medium text-white">
          Log in
        </a>
      </div>
    );
  }

  const input = (k: keyof typeof FIELDS0, label: string, type = 'text') => (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
        type={type}
        value={v[k]}
        onChange={(e) => set(k, e.target.value)}
      />
      {errors[k] && <p className="mt-1 text-sm text-red-600">{errors[k]}</p>}
    </div>
  );

  const select = (k: keyof typeof FIELDS0, label: string, opts: EnumOpt) => (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <select
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
        value={v[k]}
        onChange={(e) => set(k, e.target.value)}
      >
        <option value="">Choose…</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {errors[k] && <p className="mt-1 text-sm text-red-600">{errors[k]}</p>}
    </div>
  );

  const cityField =
    cities.length > 0 ? (
      <div>
        <label className="block text-sm font-medium text-gray-700">City</label>
        <select
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
          value={v.city}
          onChange={(e) => set('city', e.target.value)}
        >
          <option value="">Choose…</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {errors.city && <p className="mt-1 text-sm text-red-600">{errors.city}</p>}
      </div>
    ) : (
      <div>
        <label className="block text-sm font-medium text-gray-700">City</label>
        <input
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
          type="text"
          value={v.city}
          onChange={(e) => set('city', e.target.value)}
        />
        {errors.city && <p className="mt-1 text-sm text-red-600">{errors.city}</p>}
      </div>
    );

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      {input('name', 'Name')}
      {input('phone', 'Phone', 'tel')}
      {input('teudatZeut', 'Teudat zeut')}
      {cityField}
      {input('age', 'Age', 'number')}
      {select('transportation', 'Transportation', enums.transportation)}
      {select('hebrewLevel', 'Hebrew level', enums.hebrewLevel)}
      {select('gender', 'Gender', enums.gender)}
      {select('schedule', 'Schedule', enums.schedule)}
      {fatal && <p className="text-sm text-red-600">{fatal}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Registering…' : 'Register'}
      </button>
    </form>
  );
}
