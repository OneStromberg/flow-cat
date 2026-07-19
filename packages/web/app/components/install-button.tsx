'use client';

import { useEffect, useState } from 'react';
import { t, DEFAULT_LANG, type Lang } from '../../lib/i18n/strings';
import { detectPlatform, type InstallPlatform } from '../../lib/pwa-install';

// Chromium fires this before the install prompt; not in the standard DOM lib.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * Self-hiding "Install app" button. Safe to mount anywhere (login + worker shell):
 * it renders `null` unless install is actually offerable.
 * - installed / unsupported / desktop → nothing.
 * - Android/Chromium → appears reactively when `beforeinstallprompt` fires; tap
 *   triggers the native prompt and hides on accept.
 * - iOS Safari → always visible; tap opens the "Add to Home Screen" guide sheet.
 */
export function InstallButton({ lang = DEFAULT_LANG }: { lang?: Lang }) {
  const [platform, setPlatform] = useState<InstallPlatform>('unsupported');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

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

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setShowGuide(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || platform === 'installed' || platform === 'unsupported') return null;

  if (platform === 'android') {
    // Reveal only once the browser has actually offered installation.
    if (!deferred) return null;
    const onClick = async () => {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice.outcome === 'accepted') setInstalled(true);
    };
    return <InstallCta label={t('install.button', lang)} onClick={onClick} />;
  }

  // iOS Safari — no programmatic install; open the manual guide.
  return (
    <>
      <InstallCta label={t('install.button', lang)} onClick={() => setShowGuide(true)} />
      {showGuide && <A2hsSheet lang={lang} onClose={() => setShowGuide(false)} />}
    </>
  );
}

function InstallCta({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm active:bg-gray-50"
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
