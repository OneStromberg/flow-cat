'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { t, DEFAULT_LANG, type Lang } from '../../lib/i18n/strings';
import { detectPlatform, type InstallPlatform } from '../../lib/pwa-install';
import {
  subscribe,
  hasPrompt,
  getInstalled,
  getServerSnapshot,
  triggerInstall,
} from '../../lib/pwa-install-store';

/**
 * Self-hiding "Install app" button, mounted once app-wide (root layout):
 * it renders `null` unless install is actually offerable, so it's safe on
 * every screen (login, worker shell, admin shell).
 * - installed / unsupported / desktop → nothing.
 * - Android/Chromium → appears once `lib/pwa-install-store.ts` has a deferred
 *   prompt (captured as early as the pre-hydration inline script in
 *   `app/layout.tsx`); tap triggers the native prompt and hides on accept.
 * - iOS Safari → always visible; tap opens the "Add to Home Screen" guide sheet.
 *
 * Install state (deferred prompt + installed flag) lives in the external
 * store, not local component state — that's what makes the native popup
 * suppression race-proof: the store starts listening at module load, not on
 * mount, and multiple mounts/pages all read the same snapshot.
 */
export function InstallButton({ lang = DEFAULT_LANG }: { lang?: Lang }) {
  const [platform, setPlatform] = useState<InstallPlatform>('unsupported');
  const [showGuide, setShowGuide] = useState(false);
  const installed = useSyncExternalStore(subscribe, getInstalled, getServerSnapshot);
  const promptAvailable = useSyncExternalStore(subscribe, hasPrompt, getServerSnapshot);

  useEffect(() => {
    const standalone =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)').matches
        : false;
    const nav =
      typeof navigator !== 'undefined'
        ? {
            userAgent: navigator.userAgent,
            standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
          }
        : { userAgent: '' };
    setPlatform(detectPlatform(nav, standalone));
  }, []);

  if (installed || platform === 'installed' || platform === 'unsupported') return null;

  if (platform === 'android') {
    // Reveal only once the browser has actually offered installation.
    if (!promptAvailable) return null;
    return (
      <FixedInstallSlot>
        <InstallCta label={t('install.button', lang)} onClick={() => void triggerInstall()} />
      </FixedInstallSlot>
    );
  }

  // iOS Safari — no programmatic install; open the manual guide.
  return (
    <>
      <FixedInstallSlot>
        <InstallCta label={t('install.button', lang)} onClick={() => setShowGuide(true)} />
      </FixedInstallSlot>
      {showGuide && <A2hsSheet lang={lang} onClose={() => setShowGuide(false)} />}
    </>
  );
}

// Fixed, unobtrusive top-center placement so the app-wide button never
// collides with the fixed BOTTOM nav bars (WorkerNav / AdminNav). Safe-area
// aware for notches/status bars; high z-index to stay above page content but
// (deliberately) below the full-screen iOS guide sheet's own z-50 backdrop.
function FixedInstallSlot({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
      style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <div className="pointer-events-auto">{children}</div>
    </div>
  );
}

function InstallCta({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white/95 px-3.5 py-2 text-xs font-medium text-gray-800 shadow-md backdrop-blur active:bg-gray-50"
    >
      <DownloadIcon />
      {label}
    </button>
  );
}

function A2hsSheet({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const steps = [
    { icon: <ShareIcon />, text: t('install.iosStep1', lang) },
    { icon: <PlusIcon />, text: t('install.iosStep2', lang) },
    { icon: <HomeIcon />, text: t('install.iosStep3', lang) },
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={t('install.iosTitle', lang)}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-6 pb-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900 text-white">
            <ShareIcon />
          </span>
          <h2 className="text-base font-semibold text-gray-900">{t('install.iosTitle', lang)}</h2>
        </div>
        <p className="mt-3 text-sm text-gray-600">{t('install.iosIntro', lang)}</p>
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700">
                {s.icon}
              </span>
              <span className="text-sm text-gray-800">{s.text}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white"
        >
          {t('install.close', lang)}
        </button>
      </div>
    </div>
  );
}

// ── Inline icons (no external asset; render offline) ──────────────────────────
function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 12 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v11h14V9" />
    </svg>
  );
}
