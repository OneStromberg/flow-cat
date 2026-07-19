'use client';
import { SWRConfig } from 'swr';
import { sessionStorageProvider } from '../../lib/swr-session-cache';

// Defined at module scope (not inside the component) so the config object —
// and the cache provider it references — is instantiated once per module
// load, not recreated on every render.
const swrConfig = {
  provider: sessionStorageProvider,
  keepPreviousData: true,
  revalidateOnMount: true,
  revalidateOnFocus: true,
};

export function SwrProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={swrConfig}>{children}</SWRConfig>;
}
