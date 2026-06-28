import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { loadCities } from './cities.ts';

test('merges Cities tab + distinct worker cities, deduped + sorted', async () => {
  const g = createMemoryGateway({
    Cities: [['city_name'], ['Tel Aviv'], ['Haifa']],
    Workers: [['phone','city'], ['1','Tel Aviv'], ['2','Bat Yam'], ['3','']],
  });
  assert.deepEqual(await loadCities(g), ['Bat Yam', 'Haifa', 'Tel Aviv']);
});

test('empty Cities tab → falls back to worker cities', async () => {
  const g = createMemoryGateway({ Workers: [['phone','city'], ['1','Lod']] });
  assert.deepEqual(await loadCities(g), ['Lod']);
});
