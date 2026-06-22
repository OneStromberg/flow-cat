import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { listPlaces, addPlace, wazeUrl, googleMapsUrl } from './places.ts';

test('wazeUrl builds a navigate link', () => {
  assert.equal(wazeUrl('32.08', '34.78'), 'https://waze.com/ul?ll=32.08,34.78&navigate=yes');
});

test('googleMapsUrl includes place_id when present', () => {
  assert.equal(
    googleMapsUrl('32.08', '34.78', 'ChIJxyz'),
    'https://www.google.com/maps/search/?api=1&query=32.08,34.78&query_place_id=ChIJxyz',
  );
});

test('googleMapsUrl omits place_id when blank', () => {
  assert.equal(
    googleMapsUrl('32.08', '34.78', ''),
    'https://www.google.com/maps/search/?api=1&query=32.08,34.78',
  );
});

test('listPlaces parses rows including coordless legacy places', async () => {
  const g = createMemoryGateway({
    Places: [
      ['place_name', 'active', 'lat', 'lng', 'place_id', 'address'],
      ['Warehouse', 'yes', '32.1', '34.8', 'ChIJ1', '1 St'],
      ['Old Site', 'no', '', '', '', ''],
    ],
  });
  const ps = await listPlaces(g);
  assert.equal(ps.length, 2);
  assert.deepEqual(ps[0], { name: 'Warehouse', active: true, lat: '32.1', lng: '34.8', placeId: 'ChIJ1', address: '1 St' });
  assert.equal(ps[1].active, false);
  assert.equal(ps[1].lat, '');
});

test('addPlace appends an aligned row with active=yes', async () => {
  const g = createMemoryGateway({ Places: [['place_name', 'active']] });
  const r = await addPlace(g, { name: '  New Site ', lat: '32.5', lng: '34.9', placeId: 'ChIJnew', address: '5 Rd' });
  assert.deepEqual(r, { ok: true });
  const rows = g.dump().Places;
  const header = rows[0];
  const row = rows[rows.length - 1];
  const get = (c: string) => row[header.indexOf(c)];
  assert.equal(get('place_name'), 'New Site');
  assert.equal(get('active'), 'yes');
  assert.equal(get('lat'), '32.5');
  assert.equal(get('lng'), '34.9');
  assert.equal(get('place_id'), 'ChIJnew');
  assert.equal(get('address'), '5 Rd');
});

test('addPlace rejects missing name and missing/non-numeric coords', async () => {
  const g = createMemoryGateway({ Places: [['place_name', 'active']] });
  const noName = await addPlace(g, { name: '', lat: '1', lng: '2', placeId: '', address: '' });
  assert.equal(noName.ok, false);
  if (!noName.ok) assert.equal(noName.errors.name, 'Required');

  const badLat = await addPlace(g, { name: 'X', lat: 'abc', lng: '2', placeId: '', address: '' });
  assert.equal(badLat.ok, false);
  if (!badLat.ok) assert.equal(badLat.errors.lat, 'Select a place from the list');

  const noLng = await addPlace(g, { name: 'X', lat: '1', lng: '', placeId: '', address: '' });
  assert.equal(noLng.ok, false);
  if (!noLng.ok) assert.equal(noLng.errors.lng, 'Select a place from the list');
});

test('addPlace rejects duplicate place name (case-insensitive)', async () => {
  const g = createMemoryGateway({ Places: [['place_name', 'active'], ['Warehouse', 'yes']] });
  const r = await addPlace(g, { name: '  warehouse ', lat: '1', lng: '2', placeId: '', address: '' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.name, 'A place with this name already exists');
});
