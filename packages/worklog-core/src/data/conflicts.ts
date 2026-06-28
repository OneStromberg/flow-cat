import { rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';

export interface ShiftWindow { id: string; date: string; start: string; end: string }
export interface Conflict { employeePhone: string; a: ShiftWindow; b: ShiftWindow }

function nextDay(iso: string): string {
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m-1, d+1)).toISOString().slice(0,10);
}

function startMs(w: ShiftWindow): number { return Date.parse(`${w.date}T${w.start}:00Z`); }

function endMs(w: ShiftWindow): number {
  const day = w.end < w.start ? nextDay(w.date) : w.date;
  return Date.parse(`${day}T${w.end}:00Z`);
}

export function instancesOverlap(a: ShiftWindow, b: ShiftWindow): boolean {
  const aS = startMs(a), aE = endMs(a), bS = startMs(b), bE = endMs(b);
  if (![aS,aE,bS,bE].every(Number.isFinite)) return false;
  return aS < bE && bS < aE; // strict: touching endpoints don't overlap
}

export async function findConflicts(gateway: SheetsGateway, range: { from: string; to: string }): Promise<Conflict[]> {
  const instById = new Map<string, ShiftWindow>();
  for (const o of rowsToObjects(await gateway.readTab('ShiftInstances'))) {
    const id = (o.id ?? '').trim(); const date = (o.date ?? '').trim();
    if (!id || date < range.from || date > range.to) continue;
    if ((o.status ?? '').trim() === 'cancelled') continue;
    instById.set(id, { id, date, start: (o.start ?? '').trim(), end: (o.end ?? '').trim() });
  }
  // worker → their assigned instance windows (status=assigned, in range)
  const byWorker = new Map<string, ShiftWindow[]>();
  for (const o of rowsToObjects(await gateway.readTab('ShiftAssignments'))) {
    if ((o.status ?? '').trim() !== 'assigned') continue;
    const w = instById.get((o.instance_id ?? '').trim());
    const ph = (o.employee_phone ?? '').trim();
    if (!w || !ph) continue;
    (byWorker.get(ph) ?? byWorker.set(ph, []).get(ph)!).push(w);
  }
  const out: Conflict[] = [];
  for (const [ph, wins] of byWorker) {
    for (let i = 0; i < wins.length; i++)
      for (let j = i+1; j < wins.length; j++)
        if (instancesOverlap(wins[i], wins[j])) out.push({ employeePhone: ph, a: wins[i], b: wins[j] });
  }
  return out;
}
