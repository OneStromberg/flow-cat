import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { listPlaces, addPlace, updatePlace, wazeUrl, googleMapsUrl, placeGraceMins } from './places.ts';

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
  assert.deepEqual(ps[0], { name: 'Warehouse', active: true, lat: '32.1', lng: '34.8', placeId: 'ChIJ1', address: '1 St', client: '', geofenceRadiusM: '100', contact: '', baseRate: '', requiredAttributes: [], notes: '', graceMins: '' });
  assert.equal(ps[1].active, false);
  assert.equal(ps[1].lat, '');
});

test('addPlace appends an aligned row with active=yes', async () => {
  const g = createMemoryGateway({ Places: [['place_name', 'active']] });
  const r = await addPlace(g, { name: '  New Site ', lat: '32.5', lng: '34.9', placeId: 'ChIJnew', address: '5 Rd', client: '', geofenceRadiusM: '', contact: '', baseRate: '', requiredAttributes: '', notes: '', graceMins: '' });
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
  const noName = await addPlace(g, { name: '', lat: '1', lng: '2', placeId: '', address: '', client: '', geofenceRadiusM: '', contact: '', baseRate: '', requiredAttributes: '', notes: '', graceMins: '' });
  assert.equal(noName.ok, false);
  if (!noName.ok) assert.equal(noName.errors.name, 'Required');

  const badLat = await addPlace(g, { name: 'X', lat: 'abc', lng: '2', placeId: '', address: '', client: '', geofenceRadiusM: '', contact: '', baseRate: '', requiredAttributes: '', notes: '', graceMins: '' });
  assert.equal(badLat.ok, false);
  if (!badLat.ok) assert.equal(badLat.errors.lat, 'Select a place from the list');

  const noLng = await addPlace(g, { name: 'X', lat: '1', lng: '', placeId: '', address: '', client: '', geofenceRadiusM: '', contact: '', baseRate: '', requiredAttributes: '', notes: '', graceMins: '' });
  assert.equal(noLng.ok, false);
  if (!noLng.ok) assert.equal(noLng.errors.lng, 'Select a place from the list');
});

test('addPlace rejects duplicate place name (case-insensitive)', async () => {
  const g = createMemoryGateway({ Places: [['place_name', 'active'], ['Warehouse', 'yes']] });
  const r = await addPlace(g, { name: '  warehouse ', lat: '1', lng: '2', placeId: '', address: '', client: '', geofenceRadiusM: '', contact: '', baseRate: '', requiredAttributes: '', notes: '', graceMins: '' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.name, 'A place with this name already exists');
});

test('listPlaces parses new location fields and defaults geofence to 100', async () => {
  const g = createMemoryGateway({
    Places: [
      ['place_name','active','lat','lng','place_id','address','client','geofence_radius_m','contact','base_rate','required_attributes','notes'],
      ['Site A','yes','32','34','x','addr','Acme','','Dan','45','car, male','near gate'],
    ],
  });
  const p = (await listPlaces(g))[0];
  assert.equal(p.client, 'Acme');
  assert.equal(p.geofenceRadiusM, '100');           // blank → default 100
  assert.equal(p.contact, 'Dan');
  assert.equal(p.baseRate, '45');
  assert.deepEqual(p.requiredAttributes, ['car','male']);
  assert.equal(p.notes, 'near gate');
});

test('addPlace stores new fields and rejects non-numeric radius/rate', async () => {
  const g = createMemoryGateway({ Places: [['place_name','active']] });
  const ok = await addPlace(g, { name:'Site B', lat:'1', lng:'2', placeId:'', address:'', client:'Beta', geofenceRadiusM:'150', contact:'Eli', baseRate:'50', requiredAttributes:'car', notes:'gate 2', graceMins: '' });
  assert.deepEqual(ok, { ok: true });
  const rows = g.dump().Places; const h = rows[0]; const r = rows[rows.length-1];
  assert.equal(r[h.indexOf('client')], 'Beta');
  assert.equal(r[h.indexOf('geofence_radius_m')], '150');
  assert.equal(r[h.indexOf('required_attributes')], 'car');
  const bad = await addPlace(g, { name:'Site C', lat:'1', lng:'2', placeId:'', address:'', client:'', geofenceRadiusM:'wide', contact:'', baseRate:'', requiredAttributes:'', notes:'', graceMins: '' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.errors.geofenceRadiusM, 'Must be a number');
});

test('updatePlace changes a field on an existing place', async () => {
  const g = createMemoryGateway({ Places: [
    ['place_name','active','lat','lng','place_id','address','client','geofence_radius_m','contact','base_rate','required_attributes','notes','grace_mins'],
    ['Site A','yes','1','2','','addr','cli','100','c','','','note','10'],
  ]});
  const inp = { name:'Site A', lat:'1', lng:'2', placeId:'', address:'addr', client:'cli', geofenceRadiusM:'250', contact:'c', baseRate:'', requiredAttributes:'', notes:'note', graceMins:'10' };
  const r = await updatePlace(g, 'Site A', inp as any);
  assert.equal(r.ok, true);
  const p = (await listPlaces(g)).find((x) => x.name === 'Site A');
  assert.equal(p?.geofenceRadiusM, '250');
  assert.equal(p?.active, true); // preserved
  assert.equal((await updatePlace(g, 'Nope', inp as any)).ok, false);
});

test('placeGraceMins falls back to default when blank/invalid', () => {
  assert.equal(placeGraceMins({ graceMins: '15' }), 15);
  assert.equal(placeGraceMins({ graceMins: '' }), 10);
  assert.equal(placeGraceMins({ graceMins: 'x' }, 10), 10);
  assert.equal(placeGraceMins(undefined), 10);
});
