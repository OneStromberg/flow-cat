import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { instancesOverlap, findConflicts, findDuplicateAssignments } from './conflicts.ts';

test('instancesOverlap: same-day overlap, adjacency, overnight', () => {
  const w = (id:string,date:string,start:string,end:string) => ({id,date,start,end});
  assert.equal(instancesOverlap(w('a','2026-07-01','09:00','17:00'), w('b','2026-07-01','14:00','22:00')), true);  // overlap
  assert.equal(instancesOverlap(w('a','2026-07-01','09:00','17:00'), w('b','2026-07-01','17:00','22:00')), false); // touch, no overlap
  assert.equal(instancesOverlap(w('a','2026-07-01','22:00','06:00'), w('b','2026-07-02','05:00','09:00')), true);  // overnight crosses into next day
  assert.equal(instancesOverlap(w('a','2026-07-01','09:00','17:00'), w('b','2026-07-02','09:00','17:00')), false); // different days
});

test('findConflicts: a worker double-booked on overlapping instances', async () => {
  const g = createMemoryGateway({
    ShiftInstances: [['id','template_id','location','date','start','end','headcount','status','generated_at'],
      ['i1','t1','Site A','2026-07-01','09:00','17:00','1','scheduled',''],
      ['i2','t2','Site B','2026-07-01','14:00','22:00','1','scheduled',''],
      ['i3','t3','Site C','2026-07-02','09:00','17:00','1','scheduled','']],
    ShiftAssignments: [['instance_id','employee_phone','source','status','assigned_at','assigned_by'],
      ['i1','972501234567','manual','assigned','',''],
      ['i2','972501234567','manual','assigned','',''],   // overlaps i1 → conflict
      ['i3','972501234567','manual','assigned','','']],   // different day → no conflict
  });
  const cs = await findConflicts(g, { from:'2026-07-01', to:'2026-07-31' });
  assert.equal(cs.length, 1);
  assert.equal(cs[0].employeePhone, '972501234567');
  assert.deepEqual([cs[0].a.id, cs[0].b.id].sort(), ['i1','i2']);
});

test('findDuplicateAssignments flags >1 active row for same worker+instance', async () => {
  const g = createMemoryGateway({ ShiftAssignments: [
    ['instance_id','employee_phone','source','status','assigned_at','assigned_by','rate'],
    ['i1','p1','manual','assigned','2026-07-01T00:00:00.000Z','a',''],
    ['i1','p1','recurring','assigned','2026-07-02T00:00:00.000Z','s',''],
    ['i1','p2','manual','assigned','2026-07-01T00:00:00.000Z','a',''],
  ]});
  const dups = await findDuplicateAssignments(g);
  assert.equal(dups.length, 1);
  assert.deepEqual(dups[0], { instanceId: 'i1', employeePhone: 'p1', count: 2 });
});
