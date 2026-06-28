import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '../../../lib/session';
import { getRequestGateway } from '../../../lib/sheets';
import { findConflicts, listWorkers, listInstances } from '@scourage/worklog-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export default async function ConflictsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect('/');

  const params = await searchParams;
  const from = typeof params.from === 'string' ? params.from : todayISO();
  const to = typeof params.to === 'string' ? params.to : addDays(from, 42);

  const gw = getRequestGateway();
  const [conflicts, workers, instances] = await Promise.all([
    findConflicts(gw, { from, to }),
    listWorkers(gw),
    listInstances(gw, { from, to }),
  ]);

  const phoneToName = new Map(workers.map((w) => [w.phone, w.name]));
  const idToLocation = new Map(instances.map((i) => [i.id, i.location]));

  return (
    <main className="mx-auto max-w-2xl p-5">
      <h1 className="text-xl font-semibold mb-6">Schedule conflicts</h1>

      {conflicts.length === 0 ? (
        <div className="text-green-700 text-sm">No conflicts in this range ✓</div>
      ) : (
        <div className="space-y-4">
          {conflicts.map((c, i) => {
            const workerName = phoneToName.get(c.employeePhone) || c.employeePhone;
            const locA = idToLocation.get(c.a.id) || '—';
            const locB = idToLocation.get(c.b.id) || '—';
            return (
              <div key={i} className="border-l-4 border-amber-500 bg-amber-50 p-4 rounded">
                <div className="text-sm font-semibold text-gray-900 mb-2">{workerName}</div>
                <div className="text-xs text-gray-600 mb-3">{c.a.date}</div>
                <div className="space-y-2">
                  <div>
                    <Link href={`/admin/shifts/instances/${c.a.id}`} className="text-blue-600 hover:underline text-xs">
                      {locA} · {c.a.start}–{c.a.end}
                    </Link>
                  </div>
                  <div>
                    <Link href={`/admin/shifts/instances/${c.b.id}`} className="text-blue-600 hover:underline text-xs">
                      {locB} · {c.b.start}–{c.b.end}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
