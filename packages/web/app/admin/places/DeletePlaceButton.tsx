'use client';

import { useRouter } from 'next/navigation';

export function DeletePlaceButton({ name }: { name: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm('Delete this place?')) return;
    const res = await fetch('/api/admin/places', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert((json as { error?: string }).error ?? 'Delete failed');
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      className="text-red-600 hover:underline text-sm"
    >
      Delete
    </button>
  );
}
