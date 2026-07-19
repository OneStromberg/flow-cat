import './globals.css';
import type { ReactNode } from 'react';

import type { Metadata } from 'next';
import Script from 'next/script';
import { ServiceWorkerRegister } from './components/service-worker-register';
import { InstallButton } from './components/install-button';

export const metadata: Metadata = {
  title: 'FlowCat',
  description: 'Work hours logging',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FlowCat',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {/*
          Race-proof native-popup suppression: this runs before hydration (and
          before any of our own bundles), so Chrome's `beforeinstallprompt` is
          `preventDefault()`'d even if it fires while the page is still
          parsing. `lib/pwa-install-store.ts` seeds itself from
          `window.__bipEvent` on load and takes over from there.
        */}
        <Script id="bip-capture" strategy="beforeInteractive">
          {`window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.__bipEvent = e; });`}
        </Script>
        <ServiceWorkerRegister />
        {/* Mounted once, app-wide (login, worker shell, admin shell, everywhere
            else) — it self-hides via useSyncExternalStore when not
            installable/installed, so it's always safe to render. No per-user
            lang at the root, so it falls back to DEFAULT_LANG. */}
        <InstallButton />
        {children}
      </body>
    </html>
  );
}
