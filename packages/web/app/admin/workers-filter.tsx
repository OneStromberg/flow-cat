'use client';

import { useMemo, useState } from 'react';
import type { Worker } from '@scourage/worklog-core';
import { filterWorkers, type WorkerFilters } from '../../lib/filter-workers';
import { MultiSelectDropdown } from '../components/multi-select-dropdown';

type EnumOpt = readonly { value: string; label: string }[];
type Props = {
  workers: Worker[];
  cities: EnumOpt;
  places: string[];
  enums: { transportation: EnumOpt; hebrewLevel: EnumOpt; payType: EnumOpt; schedule: EnumOpt; gender: EnumOpt };
};

const EMPTY: WorkerFilters = {
  search: '', cities: [], transportation: [], hebrewLevel: [], payType: [], schedule: [], places: [], active: 'all', ageMin: '', ageMax: '', gender: [],
};


export function WorkersFilter({ workers, cities, places, enums }: Props) {
  const [f, setF] = useState<WorkerFilters>(EMPTY);

  const shown = useMemo(() => filterWorkers(workers, f), [workers, f]);
  const placeOpts = places.map((p) => ({ value: p, label: p }));

  return (
    <div className="mt-4">
      <div className="space-y-3 rounded-lg border border-gray-200 p-4">
        <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Search name or phone…"
          value={f.search} onChange={(e) => setF((p) => ({ ...p, search: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <MultiSelectDropdown label="Transportation" options={[...enums.transportation]} selected={f.transportation} onChange={(v) => setF((p) => ({ ...p, transportation: v }))} />
          <MultiSelectDropdown label="Hebrew level" options={[...enums.hebrewLevel]} selected={f.hebrewLevel} onChange={(v) => setF((p) => ({ ...p, hebrewLevel: v }))} />
          <MultiSelectDropdown label="Pay" options={[...enums.payType]} selected={f.payType} onChange={(v) => setF((p) => ({ ...p, payType: v }))} />
          <MultiSelectDropdown label="Schedule" options={[...enums.schedule]} selected={f.schedule} onChange={(v) => setF((p) => ({ ...p, schedule: v }))} />
          <MultiSelectDropdown label="Gender" options={[...enums.gender]} selected={f.gender} onChange={(v) => setF((p) => ({ ...p, gender: v }))} />
          {cities.length > 0 && <MultiSelectDropdown label="City" options={[...cities]} selected={f.cities} onChange={(v) => setF((p) => ({ ...p, cities: v }))} />}
          {placeOpts.length > 0 && <MultiSelectDropdown label="Places" options={placeOpts} selected={f.places} onChange={(v) => setF((p) => ({ ...p, places: v }))} />}
        </div>
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
                <td className="p-2 font-medium"><a href={`/admin/workers/${wk.phone}`} className="underline hover:text-gray-600">{wk.name}{wk.admin ? ' ★' : ''}</a></td>
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
