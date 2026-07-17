'use client';

import { useRouter } from 'next/navigation';

export function RepairDuplicatesButton() {
  const router = useRouter();

  async function handleRepair() {
    if (!confirm('Collapse duplicate assignments (keep earliest, remove the rest)?')) return;
    const res = await fetch('/api/admin/shifts/repair-duplicates', { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert((json as { error?: string }).error ?? 'Repair failed');
      return;
    }
    alert(`Collapsed ${(json as { collapsed?: number }).collapsed ?? 0} duplicate assignment(s).`);
    router.refresh();
  }

  return (
    <button
      onClick={handleRepair}
      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
    >
      Repair duplicate assignments
    </button>
  );
}
