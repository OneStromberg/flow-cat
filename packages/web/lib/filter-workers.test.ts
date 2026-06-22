import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterWorkers, type WorkerFilters } from './filter-workers.ts';
import type { Worker } from '@scourage/worklog-core';

const w = (o: Partial<Worker>): Worker => ({
  phone: '1', name: 'X', greeting: '', places: [], active: true, teudatZeut: '',
  admin: false, city: '', transportation: '', age: '', hebrewLevel: '', payType: '', payAmount: '', schedule: '', ...o,
});
const workers: Worker[] = [
  w({ name: 'Boss', phone: '15551230000', city: 'Tel Aviv', transportation: 'car', age: '40', places: ['Warehouse'], schedule: 'all' }),
  w({ name: 'Dan', phone: '15559990000', city: 'Haifa', transportation: 'electric_bicycle', age: '25', places: ['Office'], schedule: 'nights' }),
  w({ name: 'Eve', phone: '15558880000', city: 'Haifa', transportation: 'nothing', age: '60', places: ['Warehouse', 'Office'], active: false, schedule: 'days' }),
];
const empty: WorkerFilters = { search: '', cities: [], transportation: [], hebrewLevel: [], payType: [], schedule: [], places: [], active: 'all', ageMin: '', ageMax: '' };

test('empty filters return everyone', () => {
  assert.equal(filterWorkers(workers, empty).length, 3);
});
test('search matches name or phone (substring, case-insensitive)', () => {
  assert.deepEqual(filterWorkers(workers, { ...empty, search: 'bos' }).map((x) => x.name), ['Boss']);
  assert.deepEqual(filterWorkers(workers, { ...empty, search: '9990' }).map((x) => x.name), ['Dan']);
});
test('OR within a field, AND across fields', () => {
  // transport car OR nothing → Boss, Eve; AND city Haifa → Eve
  assert.deepEqual(filterWorkers(workers, { ...empty, transportation: ['car', 'nothing'], cities: ['Haifa'] }).map((x) => x.name), ['Eve']);
});
test('places matches any selected place', () => {
  assert.deepEqual(filterWorkers(workers, { ...empty, places: ['Office'] }).map((x) => x.name).sort(), ['Dan', 'Eve']);
});
test('active filter and age range', () => {
  assert.deepEqual(filterWorkers(workers, { ...empty, active: 'no' }).map((x) => x.name), ['Eve']);
  assert.deepEqual(filterWorkers(workers, { ...empty, ageMin: '30', ageMax: '50' }).map((x) => x.name), ['Boss']);
});
