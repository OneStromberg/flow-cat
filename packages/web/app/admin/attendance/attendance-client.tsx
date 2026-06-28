'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Attendance } from '@scourage/worklog-core';

interface AttendanceRow extends Attendance {
  workerName: string;
  location: string;
}

export function AttendanceClient({ rows }: { rows: AttendanceRow[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [editedHours, setEditedHours] = useState<Record<string, string>>({});

  async function saveHours(attendanceId: string) {
    const hours = editedHours[attendanceId];
    if (!hours) return;

    setSaving(attendanceId);
    try {
      const res = await fetch('/api/admin/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendanceId, hours }),
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
            const isEditing = row.id in editedHours;
            const displayHours = isEditing ? editedHours[row.id] : row.hours;
            const isLoading = saving === row.id;

            return (
              <tr key={row.id} className="border-b">
                <td className="py-2">{row.date}</td>
                <td>{row.workerName}</td>
                <td>{row.location}</td>
                <td>{row.checkInAt}</td>
                <td>{row.checkOutAt || '—'}</td>
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
                        onClick={() => saveHours(row.id)}
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
                    <span title="Check-in in geofence">{row.checkInInGeofence ? '✓' : '⚠'}</span>
                    <span title="Check-out in geofence">{row.checkOutInGeofence ? '✓' : '⚠'}</span>
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
