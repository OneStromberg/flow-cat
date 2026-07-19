import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { hoursByEmployee, hoursByLocation, attendanceExceptions, writeReportTab, filterAttendanceForReport, reportByObject, reportByPerson, reportSummary } from './reports.ts';
import { normalizePhone } from './phone.ts';
import type { ShiftInstance } from './shift-instances.ts';

const att = (over={}) => ({ id:'a', instanceId:'i1', employeePhone:'p1', date:'2026-07-01', checkInAt:'2026-07-01T08:10:00.000Z', checkInLat:'', checkInLng:'', checkInPhoto:'', checkInInGeofence:true, checkOutAt:'2026-07-01T16:00:00.000Z', checkOutLat:'', checkOutLng:'', checkOutPhoto:'', checkOutInGeofence:true, hours:'8', status:'closed', ...over });

test('hoursByEmployee sums closed hours in range', () => {
  const rows = [att({}), att({employeePhone:'p1', hours:'4', date:'2026-07-02'}), att({employeePhone:'p2', hours:'5'}), att({status:'open', hours:'9'})];
  const r = hoursByEmployee(rows as any, { from:'2026-07-01', to:'2026-07-31' });
  assert.deepEqual(r.find(x=>x.employeePhone==='p1'), { employeePhone:'p1', hours:12 });
  assert.deepEqual(r.find(x=>x.employeePhone==='p2'), { employeePhone:'p2', hours:5 });
});
test('hoursByLocation maps instance→location', () => {
  const loc = new Map([['i1','Site A']]);
  const r = hoursByLocation([att({}) ] as any, loc, { from:'2026-07-01', to:'2026-07-31' });
  assert.deepEqual(r, [{ location:'Site A', hours:8 }]);
});
test('attendanceExceptions flags out-of-zone and late', () => {
  const inst = new Map([['i1', { id:'i1', templateId:'t', location:'Site A', date:'2026-07-01', start:'08:00', end:'16:00', headcount:1, status:'scheduled' }]]);
  const late = att({ checkInAt:'2026-07-01T08:20:00.000Z' });            // 20m after 08:00 (grace 15) → late
  const ooz  = att({ checkInInGeofence:false, checkInAt:'2026-07-01T08:00:00.000Z' });
  const ex = attendanceExceptions([late, ooz] as any, inst as any, { from:'2026-07-01', to:'2026-07-31' });
  assert.ok(ex.some(e=>e.kind==='late'));
  assert.ok(ex.some(e=>e.kind==='out_of_zone'));
});
test('filterAttendanceForReport scopes by location and employee', () => {
  const att = [
    { id:'a', instanceId:'i1', employeePhone:'p1' },
    { id:'b', instanceId:'i2', employeePhone:'p2' },
  ] as any;
  const loc = new Map([['i1','Site A'],['i2','Site B']]);
  assert.equal(filterAttendanceForReport(att, loc, { location:'Site A' }).length, 1);
  assert.equal(filterAttendanceForReport(att, loc, { employeePhone:'p2' }).length, 1);
  assert.equal(filterAttendanceForReport(att, loc, {}).length, 2);
});
test('writeReportTab writes header + rows to a new tab', async () => {
  const g = createMemoryGateway({});
  await writeReportTab(g, 'Report X', ['a','b'], [['1','2'],['3','4']]);
  const rows = g.dump()['Report X'];
  assert.deepEqual(rows[0], ['a','b']); assert.equal(rows.length, 3);
});

const inst = (over = {}): ShiftInstance => ({ id:'i1', templateId:'t', location:'Place1', date:'2026-07-01', start:'08:00', end:'16:00', headcount:1, status:'scheduled', ...over });

test('filterAttendanceForReport accepts arrays and treats empty as all', () => {
  const loc = new Map([['i1','Place1'],['i2','Place2']]);
  const rows = [att({ instanceId:'i1' }), att({ instanceId:'i2', employeePhone:'p2' })];
  assert.equal(filterAttendanceForReport(rows as any, loc, { location: ['Place1'] }).length, 1);
  assert.equal(filterAttendanceForReport(rows as any, loc, { location: [] }).length, 2);
  assert.equal(filterAttendanceForReport(rows as any, loc, { employeePhone: ['p2'] }).length, 1);
});
test('reportByObject: one sheet per place, date blanked on repeat, per-worker + grand totals', () => {
  const instById = new Map([
    ['i1', inst({ id:'i1', date:'2026-07-01' })],
    ['i2', inst({ id:'i2', date:'2026-07-01', start:'16:00', end:'22:00' })],
  ]);
  const names = new Map([['p1','Victor'],['p2','Igor']]);
  const rng = { from:'2026-07-01', to:'2026-07-31' };
  const [sheet] = reportByObject(
    [att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-01', hours:'8' }),
     att({ instanceId:'i2', employeePhone:'p2', date:'2026-07-01', hours:'6' })] as any,
    instById, names, rng);
  assert.equal(sheet.name, 'Place1');
  assert.deepEqual(sheet.header, ['Date','Name','Start time','End time','Total']);
  assert.deepEqual(sheet.rows[0], ['2026-07-01','Victor','08:00','16:00','8']);
  assert.deepEqual(sheet.rows[1], ['','Igor','16:00','22:00','6']); // same date → blanked
  // totals block (per-worker then grand total) appears after the body
  assert.ok(sheet.rows.some((r) => r[0] === 'Victor' && r[1] === '8'));
  assert.ok(sheet.rows.some((r) => r[0] === 'Igor' && r[1] === '6'));
  assert.ok(sheet.rows.some((r) => r[0] === 'Total' && r[1] === '14'));
});
test('reportByPerson: one sheet per worker with per-place + grand totals', () => {
  const instById = new Map([['i1', inst({ location:'Place1' })]]);
  const names = new Map([['p1','Victor']]);
  const [sheet] = reportByPerson([att({ hours:'8' })] as any, instById, names, { from:'2026-07-01', to:'2026-07-31' });
  assert.equal(sheet.name, 'Victor');
  assert.deepEqual(sheet.header, ['Date','Place','Start time','End time','Total']);
  assert.deepEqual(sheet.rows[0], ['2026-07-01','Place1','08:00','16:00','8']);
  assert.ok(sheet.rows.some((r) => r[0] === 'Place1' && r[1] === '8')); // per-place total
  assert.ok(sheet.rows.some((r) => r[0] === 'Total' && r[1] === '8'));  // grand total
});
test('reportSummary: monthly buckets per place, hours*rate, rollup + grand total', () => {
  const instById = new Map([['i1', inst({ location:'Place1' })]]);
  const rateByLoc = new Map([['Place1','40']]);
  const sheet = reportSummary([att({ date:'2026-07-01', hours:'8' })] as any, instById, rateByLoc, { from:'2026-07-01', to:'2026-07-31' });
  assert.equal(sheet.title, 'Client / Selected places');
  assert.deepEqual(sheet.header, ['Date','Place','Hours','Rate','Total amount']);
  assert.deepEqual(sheet.rows[0], ['2026-07','Place1','8','40','320']); // month label, amount = 8*40
  assert.ok(sheet.rows.some((r) => r[0] === 'Place1' && r[4] === '320'));   // per-place rollup
  assert.ok(sheet.rows.some((r) => r[0] === 'Total' && r[4] === '320'));    // grand total
});

test('report totals round fractional hours to 2 decimals (0.1 + 0.2 → 0.3, not 0.30000000000000004)', () => {
  const instById = new Map([['i1', inst({ location:'Place1' })]]);
  const names = new Map([['p1','Victor']]);
  const [sheet] = reportByObject(
    [att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-01', hours:'0.1' }),
     att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-02', hours:'0.2' })] as any,
    instById, names, { from:'2026-07-01', to:'2026-07-31' });
  // Grand total should be '0.3', not '0.30000000000000004'
  const grandTotalRow = sheet.rows.find((r) => r[0] === 'Total');
  assert.equal(grandTotalRow?.[1], '0.3', 'Grand total should be "0.3"');
});

test('reportByPerson totals round fractional hours to 2 decimals', () => {
  const instById = new Map([['i1', inst({ location:'Place1' })]]);
  const names = new Map([['p1','Victor']]);
  const [sheet] = reportByPerson(
    [att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-01', hours:'0.1' }),
     att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-02', hours:'0.2' })] as any,
    instById, names, { from:'2026-07-01', to:'2026-07-31' });
  // Grand total should be '0.3'
  const grandTotalRow = sheet.rows.find((r) => r[0] === 'Total');
  assert.equal(grandTotalRow?.[1], '0.3', 'Grand total should be "0.3"');
});

test('reportSummary amount (hours*rate) rounds to 2 decimals for fractional hours', () => {
  const instById = new Map([['i1', inst({ location:'Place1' })]]);
  const rateByLoc = new Map([['Place1','30']]);
  const sheet = reportSummary([att({ date:'2026-07-01', hours:'0.1' }), att({ date:'2026-07-01', hours:'0.2' })] as any, instById, rateByLoc, { from:'2026-07-01', to:'2026-07-31' });
  // (0.1 + 0.2) * 30 = 0.3 * 30 = 9
  const dataRow = sheet.rows.find((r) => r[0] === '2026-07' && r[1] === 'Place1');
  assert.equal(dataRow?.[4], '9', 'Amount should be "9" not "8.999999999999998"');
  // Grand total should also be '9'
  const grandTotalRow = sheet.rows.find((r) => r[0] === 'Total');
  assert.equal(grandTotalRow?.[4], '9', 'Grand total should be "9"');
});

// ── filterAttendanceForReport: non-matching values + combined AND filters ─────
test('filterAttendanceForReport: an array with a non-matching value filters it out', () => {
  const loc = new Map([['i1','Place1'],['i2','Place2']]);
  const rows = [att({ instanceId:'i1', employeePhone:'p1' }), att({ instanceId:'i2', employeePhone:'p2' })];
  // 'Place3' doesn't match either row's location
  assert.equal(filterAttendanceForReport(rows as any, loc, { location: ['Place3'] }).length, 0);
  // Array containing one matching and one non-matching value still matches the one row
  assert.equal(filterAttendanceForReport(rows as any, loc, { location: ['Place1', 'PlaceX'] }).length, 1);
});

test('filterAttendanceForReport: location and employee filters AND together', () => {
  const loc = new Map([['i1','Place1'],['i2','Place1']]);
  const rows = [
    att({ instanceId:'i1', employeePhone:'p1' }), // matches both
    att({ instanceId:'i1', employeePhone:'p2' }), // wrong employee
    att({ instanceId:'i2', employeePhone:'p1' }), // matches both (same location, same employee)
  ];
  const result = filterAttendanceForReport(rows as any, loc, { location: 'Place1', employeePhone: 'p1' });
  assert.equal(result.length, 2);
  assert.ok(result.every((a) => a.employeePhone === 'p1'));
});

// ── reportByObject / reportByPerson: date-blank-on-repeat + grand-total-sum + no-sheet-for-no-closed ─
test('reportByObject: first row for a group keeps its date; only later repeats are blanked', () => {
  const instById = new Map([['i1', inst({ id:'i1', date:'2026-07-01' })]]);
  const names = new Map([['p1','Victor']]);
  const [sheet] = reportByObject(
    [att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-01', hours:'8' }),
     att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-01', hours:'4' }),
     att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-02', hours:'6' })] as any,
    instById, names, { from:'2026-07-01', to:'2026-07-31' });
  // Body rows are the first 3 entries (before the totals block)
  assert.equal(sheet.rows[0][0], '2026-07-01'); // first row for 07-01 keeps its date
  assert.equal(sheet.rows[1][0], '');           // repeat of 07-01 → blanked
  assert.equal(sheet.rows[2][0], '2026-07-02'); // new date → keeps its date (not a repeat)
});

test('reportByObject: grand-total row equals the sum of all per-worker subtotal rows', () => {
  const instById = new Map([
    ['i1', inst({ id:'i1', date:'2026-07-01' })],
    ['i2', inst({ id:'i2', date:'2026-07-02' })],
  ]);
  const names = new Map([['p1','Victor'],['p2','Igor']]);
  const [sheet] = reportByObject(
    [att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-01', hours:'8' }),
     att({ instanceId:'i2', employeePhone:'p2', date:'2026-07-02', hours:'6' }),
     att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-03', hours:'2' })] as any,
    instById, names, { from:'2026-07-01', to:'2026-07-31' });
  const subtotalRows = sheet.rows.filter((r) => r[0] === 'Victor' || r[0] === 'Igor');
  const subtotalSum = subtotalRows.reduce((s, r) => s + Number(r[1]), 0);
  const grandTotalRow = sheet.rows.find((r) => r[0] === 'Total');
  assert.equal(Number(grandTotalRow?.[1]), subtotalSum);
  assert.equal(Number(grandTotalRow?.[1]), 16); // 8 + 6 + 2
});

test('reportByObject: a place with no closed (non-open) attendance produces no sheet at all', () => {
  const instById = new Map([['i1', inst({ id:'i1' })]]);
  const names = new Map([['p1','Victor']]);
  const sheets = reportByObject(
    [att({ instanceId:'i1', employeePhone:'p1', status:'open' })] as any,
    instById, names, { from:'2026-07-01', to:'2026-07-31' });
  assert.deepEqual(sheets, []);
});

test('reportByPerson: first row for a group keeps its date; only later repeats are blanked', () => {
  const instById = new Map([['i1', inst({ id:'i1', location:'Place1' })]]);
  const [sheet] = reportByPerson(
    [att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-01', hours:'8' }),
     att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-01', hours:'4' })] as any,
    instById, new Map([['p1','Victor']]), { from:'2026-07-01', to:'2026-07-31' });
  assert.equal(sheet.rows[0][0], '2026-07-01');
  assert.equal(sheet.rows[1][0], '');
});

test('reportByPerson: grand-total row equals the sum of all per-place subtotal rows', () => {
  const instById = new Map([
    ['i1', inst({ id:'i1', location:'Place1' })],
    ['i2', inst({ id:'i2', location:'Place2' })],
  ]);
  const [sheet] = reportByPerson(
    [att({ instanceId:'i1', employeePhone:'p1', date:'2026-07-01', hours:'8' }),
     att({ instanceId:'i2', employeePhone:'p1', date:'2026-07-02', hours:'3' })] as any,
    instById, new Map([['p1','Victor']]), { from:'2026-07-01', to:'2026-07-31' });
  const subtotalRows = sheet.rows.filter((r) => r[0] === 'Place1' || r[0] === 'Place2');
  const subtotalSum = subtotalRows.reduce((s, r) => s + Number(r[1]), 0);
  const grandTotalRow = sheet.rows.find((r) => r[0] === 'Total');
  assert.equal(Number(grandTotalRow?.[1]), subtotalSum);
  assert.equal(Number(grandTotalRow?.[1]), 11);
});

test('reportByPerson: a worker with no closed (non-open) attendance produces no sheet at all', () => {
  const instById = new Map([['i1', inst({ id:'i1' })]]);
  const sheets = reportByPerson(
    [att({ instanceId:'i1', employeePhone:'p1', status:'open' })] as any,
    instById, new Map(), { from:'2026-07-01', to:'2026-07-31' });
  assert.deepEqual(sheets, []);
});

// ── reportSummary: no-rate, multi-month, grand-total-sum, month label format ──
test('reportSummary: a location with no configured rate → rate="" and amount=0 (not an error, not NaN)', () => {
  const instById = new Map([['i1', inst({ location:'Place1' })]]);
  const sheet = reportSummary([att({ date:'2026-07-01', hours:'5' })] as any, instById, new Map(), { from:'2026-07-01', to:'2026-07-31' });
  const row = sheet.rows.find((r) => r[1] === 'Place1');
  assert.equal(row?.[3], ''); // rate is blank, not '0' or 'NaN'
  assert.equal(row?.[4], '0'); // amount is 0
  const grandTotalRow = sheet.rows.find((r) => r[0] === 'Total');
  assert.equal(grandTotalRow?.[4], '0');
});

test('reportSummary: two different months of activity for one place produce two body rows + one rollup row', () => {
  const instById = new Map([['i1', inst({ location:'Place1' })]]);
  const rateByLoc = new Map([['Place1', '10']]);
  const sheet = reportSummary(
    [att({ date:'2026-06-15', hours:'5' }), att({ date:'2026-07-10', hours:'3' })] as any,
    instById, rateByLoc, { from:'2026-06-01', to:'2026-07-31' });
  const juneRow = sheet.rows.find((r) => r[0] === '2026-06' && r[1] === 'Place1');
  const julyRow = sheet.rows.find((r) => r[0] === '2026-07' && r[1] === 'Place1');
  assert.ok(juneRow, 'expected a June body row');
  assert.ok(julyRow, 'expected a July body row');
  assert.equal(juneRow?.[4], '50'); // 5 * 10
  assert.equal(julyRow?.[4], '30'); // 3 * 10
  // exactly one rollup row for Place1 (month column blank)
  const rollupRows = sheet.rows.filter((r) => r[0] === 'Place1');
  assert.equal(rollupRows.length, 1);
  assert.equal(rollupRows[0][4], '80'); // 50 + 30
});

test('reportSummary: grand total row equals the sum of all rollup row amounts', () => {
  const instById = new Map([
    ['i1', inst({ location:'Place1' })],
    ['i2', inst({ location:'Place2' })],
  ]);
  const rateByLoc = new Map([['Place1', '10'], ['Place2', '20']]);
  const sheet = reportSummary(
    [att({ instanceId:'i1', date:'2026-06-15', hours:'5' }), att({ instanceId:'i2', date:'2026-07-10', hours:'3' })] as any,
    instById, rateByLoc, { from:'2026-06-01', to:'2026-07-31' });
  const rollupRows = sheet.rows.filter((r) => r[0] === 'Place1' || r[0] === 'Place2');
  const rollupSum = rollupRows.reduce((s, r) => s + Number(r[4]), 0);
  const grandTotalRow = sheet.rows.find((r) => r[0] === 'Total');
  assert.equal(Number(grandTotalRow?.[4]), rollupSum);
  assert.equal(Number(grandTotalRow?.[4]), 110); // (5*10) + (3*20)
});

test('reportSummary: month label format is date.slice(0,7) i.e. YYYY-MM', () => {
  const instById = new Map([['i1', inst({ location:'Place1' })]]);
  const sheet = reportSummary([att({ date:'2026-11-23', hours:'1' })] as any, instById, new Map(), { from:'2026-01-01', to:'2026-12-31' });
  const row = sheet.rows.find((r) => r[1] === 'Place1');
  assert.equal(row?.[0], '2026-11'); // '2026-11-23'.slice(0,7) === '2026-11'
});

// ── R1: phone normalization in report joins/filter ────────────────────────
test('reportByObject joins names across un-normalized attendance phones', () => {
  const instById = new Map([['i1', { id:'i1', templateId:'t', location:'Site A', date:'2026-07-01', start:'08:00', end:'16:00', headcount:1, status:'scheduled' }]]);
  const names = new Map([['972506918673', 'Victor']]);           // worker phone: normalized
  const rows = [att({ instanceId:'i1', employeePhone:'0506918673', hours:'8' })]; // attendance: local form
  const [sheet] = reportByObject(rows as any, instById as any, names, { from:'2026-07-01', to:'2026-07-31' });
  assert.equal(sheet.rows[0][1], 'Victor');                       // name, not the raw number
  assert.ok(sheet.rows.some((r) => r[0] === 'Victor' && r[1] === '8'));
});
test('filterAttendanceForReport matches un-normalized attendance against normalized filter', () => {
  const loc = new Map([['i1','Site A']]);
  const rows = [att({ instanceId:'i1', employeePhone:'0506918673' })] as any;
  assert.equal(filterAttendanceForReport(rows, loc, { employeePhone: ['972506918673'] }).length, 1);
  assert.equal(filterAttendanceForReport(rows, loc, { employeePhone: [normalizePhone('0506918673')] }).length, 1);
});

// ── R1: boundary + error-path cases ───────────────────────────────────────
test('reportByObject joins names across a 00972…-prefixed attendance phone', () => {
  const instById = new Map([['i1', { id:'i1', templateId:'t', location:'Site A', date:'2026-07-01', start:'08:00', end:'16:00', headcount:1, status:'scheduled' }]]);
  const names = new Map([['972506918673', 'Victor']]);
  const rows = [att({ instanceId:'i1', employeePhone:'00972506918673', hours:'8' })]; // 00-prefixed international form
  const [sheet] = reportByObject(rows as any, instById as any, names, { from:'2026-07-01', to:'2026-07-31' });
  assert.equal(sheet.rows[0][1], 'Victor');
});

test('filterAttendanceForReport: an employeePhone filter mixing 05… and 972… forms matches both records', () => {
  const loc = new Map([['i1','Site A']]);
  const rows = [
    att({ instanceId:'i1', employeePhone:'0506918673' }),   // local form
    att({ instanceId:'i1', employeePhone:'972501112222' }), // already-international form
  ] as any;
  const result = filterAttendanceForReport(rows, loc, { employeePhone: ['0506918673', '972501112222'] });
  assert.equal(result.length, 2);
});

test('reportByObject and filterAttendanceForReport leave an alphabetic test ID (e.g. "p1") untouched by the digit-guard', () => {
  const instById = new Map([['i1', { id:'i1', templateId:'t', location:'Site A', date:'2026-07-01', start:'08:00', end:'16:00', headcount:1, status:'scheduled' }]]);
  const names = new Map([['p1', 'Test Worker']]);
  const rows = [att({ instanceId:'i1', employeePhone:'p1', hours:'8' })];
  const [sheet] = reportByObject(rows as any, instById as any, names, { from:'2026-07-01', to:'2026-07-31' });
  // If the digit-guard didn't skip normalizePhone(), 'p1' would collapse to '' and the name join would fail.
  assert.equal(sheet.rows[0][1], 'Test Worker');
  const loc = new Map([['i1','Site A']]);
  assert.equal(filterAttendanceForReport(rows as any, loc, { employeePhone: ['p1'] }).length, 1);
});
