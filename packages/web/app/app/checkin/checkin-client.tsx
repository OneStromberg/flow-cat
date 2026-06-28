'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InstanceWithAttendance } from './page';

interface CheckinClientProps {
  items: InstanceWithAttendance[];
  workerName: string;
}

export function CheckinClient({ items, workerName }: CheckinClientProps) {
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
        hours?: string;
        inGeofence?: boolean;
      };

      if (res.ok && data.ok) {
        if (data.inGeofence === false) {
          setGeofenceWarning(
            `Outside the allowed zone — your ${action === 'in' ? 'check-in' : 'check-out'} was recorded anyway.`,
          );
        }
        router.refresh();
      } else {
        setActionError(data.error ?? 'Something went wrong. Please try again.');
      }
    } catch (err: unknown) {
      if (err instanceof GeolocationDeniedError) {
        setGeoError('Location access denied. Please enable location in your browser settings and try again.');
      } else {
        setActionError('Network error. Please try again.');
      }
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        No shifts assigned to you today — contact your manager if this is a mistake.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Hi {workerName}</p>

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
          Photo (optional)
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
          <span className="text-xs text-green-700">Photo ready</span>
        )}
      </div>

      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
        {items.map(({ instance, attendance }) => {
          const isOpen = attendance?.status === 'open';
          const isClosed = attendance?.status === 'closed' || attendance?.status === 'corrected';
          const busyKey = instance.id + (isOpen ? ':out' : ':in');
          const isBusy = busy === busyKey;

          return (
            <li key={instance.id} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900">{instance.location}</div>
                <div className="mt-0.5 text-sm text-gray-500">
                  {instance.start} – {instance.end}
                </div>
                {isOpen && attendance?.checkInAt && (
                  <div className="mt-1 text-xs text-green-700">
                    Checked in at {formatTime(attendance.checkInAt)}
                  </div>
                )}
                {isClosed && attendance?.checkInAt && attendance?.checkOutAt && (
                  <div className="mt-1 text-xs text-gray-500">
                    Checked in {formatTime(attendance.checkInAt)} → out {formatTime(attendance.checkOutAt)}{attendance.hours ? ` · ${attendance.hours}h` : ''}
                  </div>
                )}
              </div>

              <div className="flex-shrink-0">
                {isOpen ? (
                  <button
                    disabled={isBusy}
                    onClick={() => handleAction(instance.id, 'out')}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {isBusy ? 'Saving…' : 'Check out'}
                  </button>
                ) : (
                  <button
                    disabled={isBusy}
                    onClick={() => handleAction(instance.id, 'in')}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {isBusy ? 'Saving…' : 'Check in'}
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
