// End-to-end pipeline test: drives the REAL data-layer functions through one
// complete scenario — worker + place + recurring shift template → generate
// dated instances → check in/out → resolve rate → payroll with a bonus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { addWorker } from './data/add-worker.ts';
import { addPlace } from './data/places.ts';
import { listPlaces } from './data/places.ts';
import { addTemplate, listTemplates } from './data/shift-templates.ts';
import { addRecurring } from './data/shift-assignments.ts';
import { generateInstances, listInstances } from './data/shift-instances.ts';
import { checkIn, checkOut, listAttendance } from './data/attendance.ts';
import { addAdjustment, listAdjustments, resolveHourlyRate, computePay } from './data/payroll.ts';
import { findWorker } from './data/workers.ts';

test('END-TO-END: worker → place → shift → generate → check-in/out → payroll', async () => {
  const g = createMemoryGateway({});
  const TODAY = '2026-07-01'; // a Wednesday
  const PHONE = '15551230000';

  // 1. Add an hourly worker (₪50/h) and a place (base ₪40/h, 100m geofence).
  const w = await addWorker(g, {
    phone: PHONE, teudatZeut: '123', name: 'Dana', places: ['Site A'], city: 'TLV', age: '30', birthdate: '',
    transportation: 'car', hebrewLevel: 'read_write', payType: 'amount', payAmount: '50',
    schedule: 'days', gender: 'female', payStructure: 'hourly', payRate: '50', role: '',
  });
  assert.equal(w.ok, true);
  const p = await addPlace(g, {
    name: 'Site A', lat: '32.08', lng: '34.78', placeId: 'x', address: 'addr', client: 'Acme',
    geofenceRadiusM: '100', contact: 'Eli', baseRate: '40', requiredAttributes: 'car', notes: '', graceMins: '',
  });
  assert.equal(p.ok, true);

  // 2. A recurring Wednesday day-shift at Site A, 1 person, no shift rate (→ falls to worker rate).
  const t = await addTemplate(g, {
    location: 'Site A', label: 'Day', days: ['Wed'], start: '08:00', end: '16:00',
    headcount: '1', validFrom: '', validTo: '', rate: '', instructions: '',
  });
  assert.equal(t.ok, true);
  const tplId = t.ok ? t.id : '';
  await addRecurring(g, tplId, PHONE);

  // 3. Generate instances for a 7-day horizon — Wed 2026-07-01 should appear + be seeded.
  const gen = await generateInstances(g, TODAY, 7);
  assert.equal(gen.instancesCreated, 1);
  assert.equal(gen.assignmentsSeeded, 1);
  const instances = await listInstances(g, { from: TODAY, to: TODAY });
  assert.equal(instances.length, 1);
  const instanceId = instances[0].id;
  assert.equal(instanceId, `${tplId}_20260701_0800`);

  // 4. Worker checks in at 08:00 and out at 16:00 (8h).
  const ci = await checkIn(g, { instanceId, employeePhone: PHONE, at: `${TODAY}T08:00:00.000Z`, lat: '32.08', lng: '34.78', photo: '', inGeofence: true });
  assert.equal(ci.ok, true);
  const co = await checkOut(g, { instanceId, employeePhone: PHONE, at: `${TODAY}T16:00:00.000Z`, lat: '32.08', lng: '34.78', photo: '', inGeofence: true });
  assert.equal(co.ok, true);
  if (co.ok) assert.equal(co.hours, '8');

  const att = await listAttendance(g, { employeePhone: PHONE });
  assert.equal(att.length, 1);
  assert.equal(att[0].status, 'closed');
  assert.equal(att[0].hours, '8');

  // 5. Admin adds a ₪20 bonus.
  const adj = await addAdjustment(g, { employeePhone: PHONE, date: TODAY, type: 'bonus', amount: '20', reason: 'good shift', createdBy: 'admin' });
  assert.equal(adj.ok, true);

  // 6. Payroll: rate precedence employee(50) > template('') > location(40) = 50; 8h × 50 = 400 + 20 bonus = 420.
  const worker = await findWorker(g, PHONE);
  const templates = await listTemplates(g);
  const places = await listPlaces(g);
  const tmpl = templates.find((x) => x.id === instances[0].templateId);
  const place = places.find((x) => x.name === instances[0].location);
  const rate = resolveHourlyRate(worker?.payRate ?? '', tmpl?.rate ?? '', place?.baseRate ?? '');
  assert.equal(rate, 50);

  const items = att.map((a) => ({ date: a.date, hours: Number(a.hours) || 0, rate }));
  const adjustments = await listAdjustments(g, { employeePhone: PHONE, from: TODAY, to: TODAY });
  const pay = computePay(worker?.payStructure ?? 'hourly', Number(worker?.payRate) || 0, items, adjustments);

  assert.equal(pay.gross, 400);
  assert.equal(pay.bonuses, 20);
  assert.equal(pay.penalties, 0);
  assert.equal(pay.net, 420);
});
