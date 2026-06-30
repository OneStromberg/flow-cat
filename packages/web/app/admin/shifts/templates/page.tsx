import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../../lib/session';
import { getRequestGateway } from '../../../../lib/sheets';
import { listTemplates } from '@scourage/worklog-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ShiftTemplatesPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/');
  const allTemplates = await listTemplates(getRequestGateway());
  const templates = allTemplates.filter((t) => t.active);

  return (
    <main className="mx-auto max-w-2xl p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Shift templates</h1>
        <Link
          href="/admin/shifts/new"
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          + New shift
        </Link>
      </div>

      {templates.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">No templates yet.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Link
                href={`/admin/shifts/templates/${t.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border border-gray-200 px-4 py-3 text-sm hover:bg-gray-50"
              >
                <span className="font-medium">{t.location}</span>
                <span className="text-gray-600">{t.label}</span>
                <span className="text-gray-500">{t.days.join(',')}</span>
                <span className="text-gray-500">{t.start}–{t.end}</span>
                <span className="text-gray-500">×{t.headcount}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
