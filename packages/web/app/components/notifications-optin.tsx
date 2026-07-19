'use client';

import { useEffect, useState } from 'react';
import { t, DEFAULT_LANG, type Lang } from '../../lib/i18n/strings';
import { detectPlatform, type InstallPlatform } from '../../lib/pwa-install';
import { urlBase64ToUint8Array } from '../../lib/push-client';

const DISMISS_KEY = 'flowcat-push-prompt';

/** True only in a browser that can actually do web push, with a VAPID key configured. */
function capabilitySupported(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  );
}

/**
 * Self-hiding "primed" push opt-in affordance, mounted in the worker + admin
 * shells (`app/app/layout.tsx`, `app/admin/layout.tsx`). Renders `null`
 * whenever push isn't actually usable — unsupported browser, missing VAPID
 * key, or (implicitly) dev, where the service worker is disabled — so it's
 * safe to mount unconditionally, same pattern as `<InstallButton/>`.
 *
 * Shows our own explainer modal ("primed" prompt) before ever calling
 * `Notification.requestPermission()`, so the one-shot system permission
 * prompt only fires once the user has already opted in on our copy.
 */
export function NotificationsOptin({ lang = DEFAULT_LANG }: { lang?: Lang }) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>('unsupported');
  const [showModal, setShowModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolveState() {
      if (!capabilitySupported()) return;
      if (cancelled) return;
      setSupported(true);
      setPermission(Notification.permission);

      const standalone =
        typeof window.matchMedia === 'function'
          ? window.matchMedia('(display-mode: standalone)').matches
          : false;
      setPlatform(
        detectPlatform(
          { userAgent: navigator.userAgent, standalone: (navigator as Navigator & { standalone?: boolean }).standalone },
          standalone,
        ),
      );

      try {
        setDismissed(window.localStorage.getItem(DISMISS_KEY) === 'dismissed');
      } catch {
        // localStorage unavailable (private mode etc.) — default to not dismissed.
      }

      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(Boolean(sub));
      } catch {
        if (!cancelled) setSubscribed(false);
      }
    }

    void resolveState();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!supported) return null;

  async function subscribeToPush(): Promise<void> {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string),
    });
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) throw new Error(`subscribe failed: ${res.status}`);
    setSubscribed(true);
  }

  async function handleEnable() {
    setModalError(null);
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        setShowModal(false);
        return;
      }
      await subscribeToPush();
      setShowModal(false);
    } catch {
      setModalError(t('checkin.generic', lang));
    } finally {
      setBusy(false);
    }
  }

  function handleNotNow() {
    try {
      window.localStorage.setItem(DISMISS_KEY, 'dismissed');
    } catch {
      // best-effort — if storage fails we just re-show next visit.
    }
    setDismissed(true);
    setShowModal(false);
  }

  async function handleSendTest() {
    setTestStatus('sending');
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const body = await res.json().catch(() => null);
      const sent = (body as { sent?: number } | null)?.sent ?? 0;
      setTestStatus(res.ok && sent > 0 ? 'sent' : 'error');
    } catch {
      setTestStatus('error');
    }
  }

  async function handleTurnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }
      setSubscribed(false);
    } catch {
      // best-effort — leave state as-is if unsubscribe fails.
    } finally {
      setBusy(false);
    }
  }

  if (subscribed) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600">
        <span>🔔 {t('push.on', lang)}</span>
        <button
          type="button"
          onClick={() => void handleSendTest()}
          disabled={testStatus === 'sending'}
          className="rounded-full border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-700 active:bg-gray-50 disabled:opacity-60"
        >
          {testStatus === 'sent' ? '✓' : testStatus === 'error' ? '!' : t('push.sendTest', lang)}
        </button>
        <button
          type="button"
          onClick={() => void handleTurnOff()}
          disabled={busy}
          className="text-gray-400 underline underline-offset-2 disabled:opacity-60"
        >
          {t('push.turnOff', lang)}
        </button>
      </div>
    );
  }

  if (permission === 'denied') {
    return <p className="text-xs text-gray-500">{t('push.denied', lang)}</p>;
  }

  if (dismissed) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setModalError(null);
          setShowModal(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shadow-sm active:bg-gray-50"
      >
        🔔 {t('push.enable', lang)}
      </button>
      {showModal &&
        (platform === 'ios' ? (
          <IosInstallFirstSheet lang={lang} onClose={() => setShowModal(false)} />
        ) : (
          <ExplainerSheet
            lang={lang}
            busy={busy}
            error={modalError}
            onEnable={() => void handleEnable()}
            onNotNow={handleNotNow}
          />
        ))}
    </>
  );
}

function ExplainerSheet({
  lang,
  busy,
  error,
  onEnable,
  onNotNow,
}: {
  lang: Lang;
  busy: boolean;
  error: string | null;
  onEnable: () => void;
  onNotNow: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={t('push.title', lang)}
      onClick={onNotNow}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-6 pb-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900 text-xl text-white">
            🔔
          </span>
          <h2 className="text-base font-semibold text-gray-900">{t('push.title', lang)}</h2>
        </div>
        <p className="mt-3 text-sm text-gray-600">{t('push.body', lang)}</p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onNotNow}
            disabled={busy}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-3 text-base font-medium text-gray-700 disabled:opacity-60"
          >
            {t('push.notNow', lang)}
          </button>
          <button
            type="button"
            onClick={onEnable}
            disabled={busy}
            className="flex-1 rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
          >
            {t('push.enableBtn', lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

function IosInstallFirstSheet({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={t('push.title', lang)}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-6 pb-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900 text-xl text-white">
            🔔
          </span>
          <h2 className="text-base font-semibold text-gray-900">{t('push.title', lang)}</h2>
        </div>
        <p className="mt-3 text-sm text-gray-600">{t('push.iosInstallFirst', lang)}</p>
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
