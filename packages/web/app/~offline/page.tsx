import type { Metadata } from 'next';
import { t, DEFAULT_LANG } from '../../lib/i18n/strings';

// Static offline fallback served by the service worker when a navigation request
// can't be fulfilled from network or cache. Fully self-contained — the logo is
// inlined and there is NO data fetch, so it renders with zero network. Copy uses
// the app default language (the chosen-language cookie isn't reliably available
// on a precached fallback).
export const metadata: Metadata = {
  title: 'FlowCat — Offline',
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-900 px-6 text-center text-white">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        width="96"
        height="96"
        aria-hidden="true"
      >
        <rect width="512" height="512" rx="96" ry="96" fill="#111827" />
        <polygon points="128,180 172,100 216,180" fill="#ffffff" />
        <polygon points="296,180 340,100 384,180" fill="#ffffff" />
        <circle cx="256" cy="290" r="110" fill="#ffffff" />
        <ellipse cx="216" cy="268" rx="18" ry="22" fill="#111827" />
        <ellipse cx="296" cy="268" rx="18" ry="22" fill="#111827" />
        <polygon points="256,296 244,310 268,310" fill="#111827" />
      </svg>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('offline.title', DEFAULT_LANG)}</h1>
        <p className="max-w-xs text-sm text-gray-300">{t('offline.body', DEFAULT_LANG)}</p>
      </div>
    </main>
  );
}
