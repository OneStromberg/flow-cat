import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '../../../lib/session';
import { getRequestGateway } from '../../../lib/sheets';
import { findConflicts, listWorkers, listInstances, listLeave, listAssignments, isOnLeave } from '@scourage/worklog-core';

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
  const [conflicts, workers, instances, approvedLeaves, assignments] = await Promise.all([
    findConflicts(gw, { from, to }),
    listWorkers(gw),
    listInstances(gw, { from, to }),
    listLeave(gw, { status: 'approved', from, to }),
    listAssignments(gw),
  ]);

  const phoneToName = new Map(workers.map((w) => [w.phone, w.name]));
  const idToInstance = new Map(instances.map((i) => [i.id, i]));

  // Find assigned-while-on-leave violations
  const leaveViolations = assignments
    .map((a) => {
      const inst = idToInstance.get(a.instanceId);
      if (!inst) return null;
      if (inst.status === 'cancelled') return null;
      if (!isOnLeave(approvedLeaves, a.employeePhone, inst.date)) return null;
      return {
        phone: a.employeePhone,
        workerName: phoneToName.get(a.employeePhone) || a.employeePhone,
        location: inst.location,
        date: inst.date,
        instanceId: a.instanceId,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return (
    <main className="mx-auto max-w-2xl p-5">
      <h1 className="text-xl font-semibold mb-6">Schedule conflicts</h1>

      {/* Assigned while on leave */}
      {leaveViolations.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-red-700 mb-3">Assigned while on approved leave</h2>
          <div className="space-y-3">
            {leaveViolations.map((v, i) => (
              <div key={i} className="border-l-4 border-red-500 bg-red-50 p-4 rounded">
                <div className="text-sm font-semibold text-gray-900">{v.workerName}</div>
                <div className="text-xs text-gray-600 mt-1">
                  Assigned to <strong>{v.location}</strong> on <strong>{v.date}</strong> but is on approved leave
                </div>
                <Link href={`/admin/shifts/instances/${v.instanceId}`} className="text-blue-600 hover:underline text-xs mt-1 inline-block">
                  View shift
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Overlap conflicts */}
      <section>
        {conflicts.length > 0 && (
          <h2 className="text-sm font-semibold text-amber-700 mb-3">Overlapping shifts</h2>
        )}
        {conflicts.length === 0 && leaveViolations.length === 0 ? (
          <div className="text-green-700 text-sm">No conflicts in this range ✓</div>
        ) : conflicts.length === 0 ? (
          <div className="text-green-700 text-sm">No overlapping shifts ✓</div>
        ) : (
          <div className="space-y-4">
            {conflicts.map((c, i) => {
              const workerName = phoneToName.get(c.employeePhone) || c.employeePhone;
              const instA = idToInstance.get(c.a.id);
              const instB = idToInstance.get(c.b.id);
              const locA = instA?.location || '—';
              const locB = instB?.location || '—';
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
      </section>
    </main>
  );
}
