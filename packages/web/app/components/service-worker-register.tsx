'use client';

import { useEffect } from 'react';

// Registers the Serwist-generated /sw.js exactly once, on mount. Guarded to
// production + browsers that support service workers. Serwist is disabled in dev
// (no /sw.js is emitted), so we never attempt to register a missing file there.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failures are non-fatal — the app still works online.
    });
  }, []);
  return null;
}
