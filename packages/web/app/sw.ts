/// <reference lib="webworker" />
// FlowCat service worker (Serwist source). Compiled by @serwist/next at build
// time into public/sw.js with the hashed precache manifest injected as
// `self.__SW_MANIFEST`. This file runs in a ServiceWorker scope, not the DOM —
// the triple-slash lib ref above + the `self` cast below give it the right
// globals while keeping the main app typecheck (lib: dom) clean.
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected by @serwist/next at build time: the hashed app-shell precache list.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        // Navigation offline fallback — served when a document request can't be
        // fulfilled from network or cache. `/~offline` is precached.
        url: '/~offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
