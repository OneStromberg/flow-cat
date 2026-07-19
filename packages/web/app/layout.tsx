import './globals.css';
import type { ReactNode } from 'react';

import type { Metadata } from 'next';
import { ServiceWorkerRegister } from './components/service-worker-register';

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
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
