'use client';
import { SWRConfig } from 'swr';
import { sessionStorageProvider } from '../../lib/swr-session-cache';
import { UnauthorizedError } from '../../lib/swr-fetcher';

// Defined at module scope (not inside the component) so the config object —
// and the cache provider it references — is instantiated once per module
// load, not recreated on every render.
const swrConfig = {
  provider: sessionStorageProvider,
  keepPreviousData: true,
  revalidateOnMount: true,
  revalidateOnFocus: true,
  // An expired/deactivated session (401 -> UnauthorizedError, see swr-fetcher.ts)
  // means every worker-screen key is now unreadable — bounce to /login instead of
  // leaving the screen on stale/crashed data.
  onError: (err: unknown) => {
    if (err instanceof UnauthorizedError && typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
};

export function SwrProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={swrConfig}>{children}</SWRConfig>;
}
