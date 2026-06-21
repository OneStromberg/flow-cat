'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="text-sm text-gray-500 underline"
      onClick={async () => {
        await fetch('/api/logout', { method: 'POST' });
        router.replace('/login');
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
