'use client';

import { useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import type { CheckinData } from '../../../lib/data/worker-checkin';
import { GeoPoller } from './geo-poller';
import { t, DEFAULT_LANG, type Lang } from '../../../lib/i18n/strings';
import { compressImage } from '../../../lib/image-compress';
import { swrFetcher } from '../../../lib/swr-fetcher';

interface CheckinClientProps {
  workerName: string;
  lang?: Lang;
}

export function CheckinClient({ workerName, lang = DEFAULT_LANG }: CheckinClientProps) {
  const { data } = useSWR<CheckinData>('/api/worker/checkin', swrFetcher);
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState<string | null>(null);
  const [geofenceWarning, setGeofenceWarning] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const items = data?.items ?? [];

  function captureSelfie(): Promise<string | null> {
    const input = fileRef.current;
    if (!input) return Promise.resolve(null);
    return new Promise((resolve) => {
      input.value = '';
      let settled = false;
      const onWindowFocus = () => {
        window.removeEventListener('focus', onWindowFocus);
        // Neither `change` nor `cancel` is guaranteed here (older browsers don't fire
        // `cancel` at all). Give the picker a beat to populate `files`, then bail out
        // if it's still empty — that means the user backed out without picking a photo.
        setTimeout(() => {
          if (!input.files?.length) settle(null);
        }, 500);
      };
      const settle = (value: string | null) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', onWindowFocus);
        input.onchange = null;
        input.oncancel = null;
        resolve(value);
      };
      input.oncancel = () => settle(null);
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) { settle(null); return; }
        const reader = new FileReader();
        reader.onload = () => settle(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => settle(null);
        reader.readAsDataURL(file);
      };
      window.addEventListener('focus', onWindowFocus);
      input.click();
    });
  }

  async function handleAction(instanceId: string, action: 'in' | 'out') {
    // Guard: items haven't loaded yet (data undefined) — the buttons that call this
    // aren't rendered until data is present, but stay defensive rather than trust that.
    if (!data) return;

    setGeofenceWarning(null);
    setGeoError(null);
    setActionError(null);
    setBusy(instanceId + ':' + action);

    try {
      const item = items.find((it) => it.instance.id === instanceId);
      const needsSelfie = action === 'in' ? !!item?.selfieStart : !!item?.selfieEnd;
      let photo: string | undefined;
      if (needsSelfie) {
        const captured = await captureSelfie();
        if (!captured) {
          setActionError(t('checkin.cameraFailed', lang));
          setBusy(null);
          return;
        }
        photo = await compressImage(captured);
      }

      const { lat, lng } = await getPosition();

      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId, action, lat, lng, photo }),
      });

      const result = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        hours?: string;
        inGeofence?: boolean;
      };

      if (res.ok && result.ok) {
        if (result.inGeofence === false) {
          setGeofenceWarning(t('checkin.outsideZone', lang));
        }
        // Revalidate the shift list so the button flips in→out (was router.refresh()).
        await mutate('/api/worker/checkin');
      } else {
        // Regression note: a geofence-blocked checkout returns 422 (res.ok === false), so it
        // always lands here as a blocking actionError — it can never fall into the soft
        // geofenceWarning branch above, which only fires on a successful (res.ok) response.
        setActionError(result.message ?? result.error ?? t('checkin.generic', lang));
      }
    } catch (err: unknown) {
      if (err instanceof GeolocationDeniedError) {
        setGeoError(t('checkin.geoDenied', lang));
      } else {
        setActionError(t('checkin.network', lang));
      }
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-md p-5" aria-busy="true" aria-live="polite">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-1/2 rounded bg-gray-200" />
          <div className="h-4 w-1/3 rounded bg-gray-200" />
          <div className="space-y-2">
            <div className="h-20 rounded-lg bg-gray-200" />
            <div className="h-16 rounded-lg bg-gray-200" />
          </div>
        </div>
      </main>
    );
  }

  const openInstanceId = items.find(({ attendance }) => attendance?.status === 'open')?.instance.id ?? null;

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="text-xl font-semibold">{t('checkin.title', lang)}</h1>
      <p className="mt-1 text-sm text-gray-500">{t('checkin.today', lang)} · {data.today}</p>
      <div className="mt-6">
        {items.length === 0 ? (
          <p className="text-sm text-gray-600">
            {t('checkin.empty', lang)}
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{t('checkin.hi', lang)} {workerName}</p>

            {openInstanceId && <GeoPoller instanceId={openInstanceId} />}

            {geofenceWarning && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {geofenceWarning}
              </div>
            )}
            {geoError && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                {geoError}
              </div>
            )}
            {actionError && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                {actionError}
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" />

            <ul className="space-y-3">
              {items.map(({ instance, attendance, role, instructions, address, contact, wazeUrl: navUrl, mapsUrl }, index) => {
                const isOpen = attendance?.status === 'open';
                const isClosed = attendance?.status === 'closed' || attendance?.status === 'corrected';
                const busyKey = instance.id + (isOpen ? ':out' : ':in');
                const isBusy = busy === busyKey;
                const isPrimary = index === 0;

                return (
                  <li
                    key={instance.id}
                    className={
                      isPrimary
                        ? 'flex items-start justify-between gap-4 rounded-lg border-2 border-gray-900 bg-gray-50 p-4'
                        : 'flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-3'
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className={isPrimary ? 'text-base font-semibold text-gray-900' : 'text-sm font-medium text-gray-700'}>
                        {instance.location}
                      </div>
                      <div className="mt-0.5 text-sm text-gray-500">
                        {instance.start} – {instance.end}
                      </div>
                      {role && (
                        <div className="mt-1 text-sm font-bold text-gray-800">{role}</div>
                      )}
                      {(instructions || address || contact) && (
                        <details className="mt-2 text-sm text-gray-600">
                          <summary className="cursor-pointer font-medium text-gray-700">{t('checkin.details', lang)}</summary>
                          <div className="mt-1 space-y-1">
                            {instructions && <div className="whitespace-pre-wrap"><span className="font-medium">{t('checkin.instructions', lang)}: </span>{instructions}</div>}
                            {address && <div><span className="font-medium">{t('checkin.address', lang)}: </span>{address}</div>}
                            {contact && <div><span className="font-medium">{t('checkin.contact', lang)}: </span>{contact}</div>}
                            {navUrl && <a href={navUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">{t('checkin.waze', lang)}</a>}
                            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="ml-3 text-blue-600 underline">{t('checkin.maps', lang)}</a>}
                          </div>
                        </details>
                      )}
                      {isOpen && attendance?.checkInAt && (
                        <div className="mt-1 text-xs text-green-700">
                          {t('checkin.checkedInAt', lang)} {formatTime(attendance.checkInAt)}
                        </div>
                      )}
                      {isClosed && attendance?.checkInAt && attendance?.checkOutAt && (
                        <div className="mt-1 text-xs text-gray-500">
                          {t('checkin.checkedIn', lang)} {formatTime(attendance.checkInAt)} → {t('checkin.out', lang)} {formatTime(attendance.checkOutAt)}{attendance.hours ? ` · ${attendance.hours}h` : ''}
                        </div>
                      )}
                    </div>

                    <div className="flex-shrink-0">
                      {isOpen ? (
                        <button
                          disabled={isBusy}
                          onClick={() => handleAction(instance.id, 'out')}
                          className="rounded-lg bg-gray-900 px-5 py-3 text-base font-medium text-white disabled:opacity-50"
                        >
                          {isBusy ? t('checkin.saving', lang) : t('checkin.end', lang)}
                        </button>
                      ) : (
                        <button
                          disabled={isBusy}
                          onClick={() => handleAction(instance.id, 'in')}
                          className="rounded-lg bg-gray-900 px-5 py-3 text-base font-medium text-white disabled:opacity-50"
                        >
                          {isBusy ? t('checkin.saving', lang) : t('checkin.start', lang)}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

class GeolocationDeniedError extends Error {}

function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new GeolocationDeniedError('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new GeolocationDeniedError('Permission denied'));
        } else {
          reject(new Error('Geolocation error'));
        }
      },
      // High-accuracy GPS, fresh fix (no cached position), 10s ceiling.
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
