'use client';

import { useRouter } from 'next/navigation';

export function RepairOrphansButton() {
  const router = useRouter();

  async function handleRepair() {
    if (!confirm('Cancel orphaned scheduled shifts (deleted/inactive template or place)?')) return;
    const res = await fetch('/api/admin/shifts/repair-orphans', { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert((json as { error?: string }).error ?? 'Repair failed');
      return;
    }
    alert(`Cancelled ${(json as { cancelled?: number }).cancelled ?? 0} orphaned shift(s).`);
    router.refresh();
  }

  return (
    <button
      onClick={handleRepair}
      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
    >
      Repair orphaned shifts
    </button>
  );
}
