'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type EnumOpt = readonly { value: string; label: string }[];
type Props = { places: string[]; cities: EnumOpt; enums: { transportation: EnumOpt; hebrewLevel: EnumOpt; payType: EnumOpt; schedule: EnumOpt; gender: EnumOpt; payStructure: EnumOpt } };

const FIELDS0 = {
  phone: '', teudatZeut: '', name: '', city: '', birthdate: '',
  transportation: '', hebrewLevel: '', payType: '', payAmount: '', schedule: '', gender: '',
  payStructure: '', payRate: '',
};

export function AddWorkerForm({ places, cities, enums }: Props) {
  const router = useRouter();
  const [v, setV] = useState({ ...FIELDS0 });
  const [selPlaces, setSelPlaces] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof FIELDS0, val: string) => setV((p) => ({ ...p, [k]: val }));
  const togglePlace = (p: string) => setSelPlaces((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFatal(null);
    try {
      const res = await fetch('/api/admin/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, places: selPlaces }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        router.replace('/admin');
        router.refresh();
      } else if (res.status === 400 && data.errors) {
        setErrors(data.errors);
        setBusy(false);
      } else {
        setFatal('Could not save. Please try again.');
        setBusy(false);
      }
    } catch {
      setFatal('Network error. Please try again.');
      setBusy(false);
    }
  }

  const input = (k: keyof typeof FIELDS0, label: string, type = 'text') => (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base" type={type}
        value={v[k]} onChange={(e) => set(k, e.target.value)} />
      {errors[k] && <p className="mt-1 text-sm text-red-600">{errors[k]}</p>}
    </div>
  );
  const select = (k: keyof typeof FIELDS0, label: string, opts: EnumOpt) => (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base" value={v[k]} onChange={(e) => set(k, e.target.value)}>
        <option value="">Choose…</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {errors[k] && <p className="mt-1 text-sm text-red-600">{errors[k]}</p>}
    </div>
  );

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      {input('phone', 'Phone', 'tel')}
      {input('teudatZeut', 'Teudat zeut')}
      {input('name', 'Full name')}
      <div>
        <label className="block text-sm font-medium text-gray-700">Allowed places</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {places.map((p) => (
            <button key={p} type="button" onClick={() => togglePlace(p)}
              className={`rounded-full border px-2.5 py-1 text-sm ${selPlaces.includes(p) ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700'}`}>{p}</button>
          ))}
        </div>
      </div>
      {select('city', 'City', cities)}
      {input('birthdate', 'Date of birth', 'date')}
      {select('transportation', 'Transportation', enums.transportation)}
      {select('gender', 'Gender', enums.gender)}
      {select('hebrewLevel', 'Hebrew level', enums.hebrewLevel)}
      {select('payType', 'Pay eligibility', enums.payType)}
      {v.payType === 'amount' && input('payAmount', 'Amount', 'number')}
      {input('payRate', 'Pay rate', 'number')}
      {select('schedule', 'Shift preference', enums.schedule)}
      {fatal && <p className="text-sm text-red-600">{fatal}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
        {busy ? 'Saving…' : 'Add worker'}
      </button>
    </form>
  );
}
