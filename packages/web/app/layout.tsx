import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'FlowCat', description: 'Work hours logging' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
