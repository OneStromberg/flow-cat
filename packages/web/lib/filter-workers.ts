import type { Worker } from '@scourage/worklog-core';

export interface WorkerFilters {
  search: string;
  cities: string[];
  transportation: string[];
  hebrewLevel: string[];
  payType: string[];
  schedule: string[];
  places: string[];
  active: 'all' | 'yes' | 'no';
  ageMin: string;
  ageMax: string;
  gender: string[];
}

const inSet = (val: string | undefined, set: string[]): boolean => set.length === 0 || set.includes(val ?? '');

export function filterWorkers(workers: Worker[], f: WorkerFilters): Worker[] {
  const search = f.search.trim().toLowerCase().normalize('NFC');
  return workers.filter((wk) => {
    if (search && !`${wk.name} ${wk.phone}`.toLowerCase().normalize('NFC').includes(search)) return false;
    if (!inSet(wk.city, f.cities)) return false;
    if (!inSet(wk.transportation, f.transportation)) return false;
    if (!inSet(wk.hebrewLevel, f.hebrewLevel)) return false;
    if (!inSet(wk.payType, f.payType)) return false;
    if (!inSet(wk.schedule, f.schedule)) return false;
    if (!inSet(wk.gender, f.gender)) return false;
    if (f.places.length > 0 && !wk.places.some((p) => f.places.includes(p))) return false;
    if (f.active === 'yes' && !wk.active) return false;
    if (f.active === 'no' && wk.active) return false;
    if (f.ageMin.trim() || f.ageMax.trim()) {
      const age = Number(wk.age);
      if (!Number.isFinite(age) || (wk.age ?? '').trim() === '') return false;
      if (f.ageMin.trim() && age < Number(f.ageMin)) return false;
      if (f.ageMax.trim() && age > Number(f.ageMax)) return false;
    }
    return true;
  });
}
