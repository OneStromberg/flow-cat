'use client';

import { useMemo, useState } from 'react';
import type { Worker } from '@scourage/worklog-core';
import { filterWorkers, type WorkerFilters } from '../../lib/filter-workers';

type EnumOpt = readonly { value: string; label: string }[];
type Props = {
  workers: Worker[];
  cities: string[];
  places: string[];
  enums: { transportation: EnumOpt; hebrewLevel: EnumOpt; payType: EnumOpt; schedule: EnumOpt; gender: EnumOpt };
};

const EMPTY: WorkerFilters = {
  search: '', cities: [], transportation: [], hebrewLevel: [], payType: [], schedule: [], places: [], active: 'all', ageMin: '', ageMax: '', gender: [],
};

function Chips({ label, options, selected, onToggle }: { label: string; options: { value: string; label: string }[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o.value} type="button" onClick={() => onToggle(o.value)}
            className={`rounded-full border px-2.5 py-1 text-xs ${selected.includes(o.value) ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WorkersFilter({ workers, cities, places, enums }: Props) {
  const [f, setF] = useState<WorkerFilters>(EMPTY);
  const toggle = (key: keyof WorkerFilters, v: string) =>
    setF((prev) => {
      const arr = prev[key] as string[];
      return { ...prev, [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });

  const shown = useMemo(() => filterWorkers(workers, f), [workers, f]);
  const cityOpts = cities.map((c) => ({ value: c, label: c }));
  const placeOpts = places.map((p) => ({ value: p, label: p }));

  return (
    <div className="mt-4">
      <div className="space-y-3 rounded-lg border border-gray-200 p-4">
        <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Search name or phone…"
          value={f.search} onChange={(e) => setF((p) => ({ ...p, search: e.target.value }))} />
        <Chips label="Transportation" options={[...enums.transportation]} selected={f.transportation} onToggle={(v) => toggle('transportation', v)} />
        <Chips label="Hebrew level" options={[...enums.hebrewLevel]} selected={f.hebrewLevel} onToggle={(v) => toggle('hebrewLevel', v)} />
        <Chips label="Pay" options={[...enums.payType]} selected={f.payType} onToggle={(v) => toggle('payType', v)} />
        <Chips label="Schedule" options={[...enums.schedule]} selected={f.schedule} onToggle={(v) => toggle('schedule', v)} />
        <Chips label="Gender" options={[...enums.gender]} selected={f.gender} onToggle={(v) => toggle('gender', v)} />
        {cityOpts.length > 0 && <Chips label="City" options={cityOpts} selected={f.cities} onToggle={(v) => toggle('cities', v)} />}
        {placeOpts.length > 0 && <Chips label="Places" options={placeOpts} selected={f.places} onToggle={(v) => toggle('places', v)} />}
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Age
            <div className="mt-1 flex items-center gap-1">
              <input className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm" type="number" placeholder="min" value={f.ageMin} onChange={(e) => setF((p) => ({ ...p, ageMin: e.target.value }))} />
              <span>–</span>
              <input className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm" type="number" placeholder="max" value={f.ageMax} onChange={(e) => setF((p) => ({ ...p, ageMax: e.target.value }))} />
            </div>
          </label>
          <label className="text-sm">Active
            <select className="mt-1 block rounded-lg border border-gray-300 px-2 py-1 text-sm" value={f.active} onChange={(e) => setF((p) => ({ ...p, active: e.target.value as WorkerFilters['active'] }))}>
              <option value="all">All</option><option value="yes">Active</option><option value="no">Inactive</option>
            </select>
          </label>
          <button type="button" className="ml-auto text-sm text-gray-500 underline" onClick={() => setF(EMPTY)}>Clear</button>
        </div>
      </div>

      <p className="mt-3 text-sm text-gray-500">{shown.length} of {workers.length} shown</p>
      <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr><th className="p-2">Name</th><th className="p-2">Phone</th><th className="p-2">City</th><th className="p-2">Age</th><th className="p-2">Transport</th><th className="p-2">Schedule</th><th className="p-2">Active</th></tr>
          </thead>
          <tbody>
            {shown.map((wk) => (
              <tr key={wk.phone} className="border-t border-gray-100">
                <td className="p-2 font-medium">{wk.name}{wk.admin ? ' ★' : ''}</td>
                <td className="p-2">{wk.phone}</td>
                <td className="p-2">{wk.city}</td>
                <td className="p-2">{wk.age}</td>
                <td className="p-2">{wk.transportation}</td>
                <td className="p-2">{wk.schedule}</td>
                <td className="p-2">{wk.active ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
