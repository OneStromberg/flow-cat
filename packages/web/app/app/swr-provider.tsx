'use client';
import { SWRConfig } from 'swr';
import { sessionStorageProvider } from '../../lib/swr-session-cache';
import { UnauthorizedError } from '../../lib/swr-fetcher';

// Defined at module scope (not inside the component) so the config object —
// and the cache provider it references — is instantiated once per module
// load, not recreated on every render.
const swrConfig = {
  provider: sessionStorageProvider,
  // No keepPreviousData: the worker-screen SWR keys never change (each screen
  // subscribes to exactly one fixed URL), so there's never a "previous key's
  // data" to keep — the sessionStorage provider + revalidateOnMount below are
  // what actually give the instant-return.
  revalidateOnMount: true,
  revalidateOnFocus: true,
  // Rapid revalidations (e.g. the selfie-capture `window.focus` handler firing
  // mid-check-in, right on top of `revalidateOnFocus`) collapse into one request.
  dedupingInterval: 5000,
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
