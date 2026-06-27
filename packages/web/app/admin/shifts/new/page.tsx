import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../../lib/session';
import { getRequestGateway } from '../../../../lib/sheets';
import { loadActivePlaces } from '@scourage/worklog-core';
import { AddTemplateForm } from './add-template-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NewShiftTemplatePage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/');
  const places = await loadActivePlaces(getRequestGateway());
  return (
    <main className="mx-auto max-w-md p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Add shift template</h1>
        <a href="/admin/shifts/templates" className="text-sm text-gray-500 underline">Back</a>
      </div>
      <AddTemplateForm places={places} />
    </main>
  );
}
