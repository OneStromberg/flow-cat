'use client';

import { useRouter } from 'next/navigation';
import { clearClientCache } from '../../lib/clear-client-cache';

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="text-sm text-gray-500 underline"
      onClick={async () => {
        await fetch('/api/logout', { method: 'POST' });
        // Purge this worker's sessionStorage SWR cache + service-worker
        // runtime caches BEFORE navigating away, so a shared device never
        // hands the next worker's login the previous worker's cached data.
        await clearClientCache();
        router.replace('/login');
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
