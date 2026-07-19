'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InstanceWithAttendance } from './page';
import { GeoPoller } from './geo-poller';
import { t, DEFAULT_LANG, type Lang } from '../../../lib/i18n/strings';

interface CheckinClientProps {
  items: InstanceWithAttendance[];
  workerName: string;
  lang?: Lang;
}

export function CheckinClient({ items, workerName, lang = DEFAULT_LANG }: CheckinClientProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [geofenceWarning, setGeofenceWarning] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhotoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function handleAction(instanceId: string, action: 'in' | 'out') {
    setGeofenceWarning(null);
    setGeoError(null);
    setActionError(null);
    setBusy(instanceId + ':' + action);

    try {
      const { lat, lng } = await getPosition();

      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId, action, lat, lng, photo: photoDataUrl }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        hours?: string;
        inGeofence?: boolean;
      };

      if (res.ok && data.ok) {
        if (data.inGeofence === false) {
          setGeofenceWarning(t('checkin.outsideZone', lang));
        }
        router.refresh();
      } else {
        // Regression note: a geofence-blocked checkout returns 422 (res.ok === false), so it
        // always lands here as a blocking actionError — it can never fall into the soft
        // geofenceWarning branch above, which only fires on a successful (res.ok) response.
        setActionError(data.message ?? data.error ?? t('checkin.generic', lang));
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

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        {t('checkin.empty', lang)}
      </p>
    );
  }

  const openInstanceId = items.find(({ attendance }) => attendance?.status === 'open')?.instance.id ?? null;

  return (
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

      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600" htmlFor="checkin-photo">
          {t('checkin.photoOptional', lang)}
        </label>
        <input
          id="checkin-photo"
          type="file"
          accept="image/*"
          capture="user"
          className="text-sm text-gray-700"
          onChange={handlePhotoChange}
        />
        {photoDataUrl && (
          <span className="text-xs text-green-700">{t('checkin.photoReady', lang)}</span>
        )}
      </div>

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
