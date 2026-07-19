'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Attendance } from '@scourage/worklog-core';

interface AttendanceRow extends Attendance {
  workerName: string;
  location: string;
}

// mirror the TZ hardcoded for display formatting — admin always types Jerusalem wall-clock
const COMPANY_TZ = 'Asia/Jerusalem';

// Duplicated (not imported) from @scourage/worklog-core's time/dates.ts:
// value-importing ANY runtime export from the package barrel (index.ts) transitively pulls in
// @google-cloud/firestore -> grpc-js, which needs Node's `tls`/`net` and breaks this 'use client'
// component's browser bundle (`next build` fails: "Module not found: Can't resolve 'tls'/'net'").
// Every other 'use client' component in this app only ever `import type` from this package for
// the same reason — keep this copy byte-identical to the source of truth in worklog-core.
function wallClockISO(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
  const hour = g('hour') === '24' ? '00' : g('hour');
  return `${g('year')}-${g('month')}-${g('day')}T${hour}:${g('minute')}:${g('second')}`;
}

// ponytail: ignores the once-a-year DST transition hour; not worth a tz lib for shift logic.
function localWallClockToUTC(date: string, hhmm: string, tz: string): string {
  const asUTC = Date.parse(`${date}T${hhmm}:00Z`);
  if (Number.isNaN(asUTC)) return '';
  const probe = new Date(asUTC);
  const offset = Date.parse(wallClockISO(probe, tz) + 'Z') - Date.parse(wallClockISO(probe, 'UTC') + 'Z');
  return new Date(asUTC - offset).toISOString();
}

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COMPANY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(t));
  const g = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

function localToUtcIso(local: string): string {
  const [date, hm] = local.split('T');
  if (!date || !hm) return '';
  return localWallClockToUTC(date, hm, COMPANY_TZ);
}

export function AttendanceClient({ rows }: { rows: AttendanceRow[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [editedHours, setEditedHours] = useState<Record<string, string>>({});
  const [editedIn, setEditedIn] = useState<Record<string, string>>({});
  const [editedOut, setEditedOut] = useState<Record<string, string>>({});

  async function saveRow(attendanceId: string) {
    const payload: Record<string, string> = { attendanceId };
    if (attendanceId in editedIn) payload.checkInAt = localToUtcIso(editedIn[attendanceId]);
    if (attendanceId in editedOut) payload.checkOutAt = localToUtcIso(editedOut[attendanceId]);
    if (attendanceId in editedHours) payload.hours = editedHours[attendanceId];
    if (Object.keys(payload).length === 1) return;

    setSaving(attendanceId);
    try {
      const res = await fetch('/api/admin/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        alert('Error: ' + (data.error || 'Failed to save'));
        return;
      }

      setEditedHours((prev) => {
        const next = { ...prev };
        delete next[attendanceId];
        return next;
      });
      setEditedIn((prev) => {
        const next = { ...prev };
        delete next[attendanceId];
        return next;
      });
      setEditedOut((prev) => {
        const next = { ...prev };
        delete next[attendanceId];
        return next;
      });
      router.refresh();
    } catch (err) {
      console.error('save failed:', err);
      alert('Network error');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs text-gray-500">⚠ = outside allowed zone (in / out)</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Date</th>
            <th>Worker</th>
            <th>Location</th>
            <th>Check-in Time</th>
            <th>Check-out Time</th>
            <th>Hours</th>
            <th>In-Geofence</th>
            <th>Photos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isEditing = row.id in editedHours || row.id in editedIn || row.id in editedOut;
            const displayHours = row.id in editedHours ? editedHours[row.id] : row.hours;
            const isLoading = saving === row.id;

            return (
              <tr key={row.id} className="border-b">
                <td className="py-2">{row.date}</td>
                <td>{row.workerName}</td>
                <td>{row.location}</td>
                <td>
                  <input
                    type="datetime-local"
                    value={row.id in editedIn ? editedIn[row.id] : toLocalInput(row.checkInAt)}
                    onChange={(e) =>
                      setEditedIn((prev) => ({
                        ...prev,
                        [row.id]: e.target.value,
                      }))
                    }
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                    disabled={isLoading}
                  />
                </td>
                <td>
                  <input
                    type="datetime-local"
                    value={row.id in editedOut ? editedOut[row.id] : toLocalInput(row.checkOutAt)}
                    onChange={(e) =>
                      setEditedOut((prev) => ({
                        ...prev,
                        [row.id]: e.target.value,
                      }))
                    }
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                    disabled={isLoading}
                  />
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={displayHours}
                      onChange={(e) =>
                        setEditedHours((prev) => ({
                          ...prev,
                          [row.id]: e.target.value,
                        }))
                      }
                      className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                      disabled={isLoading}
                    />
                    {isEditing && (
                      <button
                        onClick={() => saveRow(row.id)}
                        disabled={isLoading}
                        className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                      >
                        {isLoading ? 'Saving…' : 'Save'}
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <span className="flex gap-1">
                    <span title={row.checkInInGeofence ? 'Check-in inside the allowed zone' : 'Check-in outside the allowed zone'}>{row.checkInInGeofence ? '✓' : '⚠'}</span>
                    <span title={row.checkOutInGeofence ? 'Check-out inside the allowed zone' : 'Check-out outside the allowed zone'}>{row.checkOutInGeofence ? '✓' : '⚠'}</span>
                  </span>
                </td>
                <td className="flex gap-2 text-blue-600">
                  {row.checkInPhoto && (
                    <a href={`/api/admin/photo?name=${encodeURIComponent(row.checkInPhoto)}`} target="_blank" rel="noopener noreferrer" className="underline">
                      In
                    </a>
                  )}
                  {row.checkOutPhoto && (
                    <a href={`/api/admin/photo?name=${encodeURIComponent(row.checkOutPhoto)}`} target="_blank" rel="noopener noreferrer" className="underline">
                      Out
                    </a>
                  )}
                  {!row.checkInPhoto && !row.checkOutPhoto && '—'}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="py-4 text-center text-gray-500">
                No attendance records.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
