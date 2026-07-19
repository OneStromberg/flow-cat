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

// Additive raw push handlers — Serwist's addEventListeners() above only wires
// precache/runtime-caching/offline-fallback machinery; it does not touch
// 'push' or 'notificationclick', so these listeners are registered
// independently and do not interfere with the Serwist setup.
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {};
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    payload = {};
  }
  const title = payload.title ?? 'FlowCat';
  const body = payload.body ?? 'You have a new notification';
  const url = payload.url ?? '/';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data && (event.notification.data as { url?: string }).url) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if (c.url.includes(url) && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
