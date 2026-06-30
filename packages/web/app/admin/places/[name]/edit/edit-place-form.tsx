'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Place } from '@scourage/worklog-core';

export function EditPlaceForm({ place }: { place: Place }) {
  const router = useRouter();
  const [lat, setLat] = useState(place.lat);
  const [lng, setLng] = useState(place.lng);
  const [address, setAddress] = useState(place.address);
  const [client, setClient] = useState(place.client);
  const [contact, setContact] = useState(place.contact);
  const [geofenceRadiusM, setGeofenceRadiusM] = useState(place.geofenceRadiusM);
  const [baseRate, setBaseRate] = useState(place.baseRate);
  const [requiredAttributes, setRequiredAttributes] = useState(place.requiredAttributes.join(', '));
  const [notes, setNotes] = useState(place.notes);
  const [graceMins, setGraceMins] = useState(place.graceMins);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/places', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingName: place.name,
          name: place.name,
          lat,
          lng,
          placeId: place.placeId,
          address,
          client,
          contact,
          geofenceRadiusM,
          baseRate,
          requiredAttributes,
          notes,
          graceMins,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        router.replace(`/admin/places/${encodeURIComponent(place.name)}`);
        router.refresh();
      } else {
        setErr((data.error as string | undefined) ?? 'Could not save. Please try again.');
        setBusy(false);
      }
    } catch {
      setErr('Network error. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Place name</label>
        <p className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">{place.name}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Address</label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
          placeholder="Address"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Latitude</label>
          <input
            type="number"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
            placeholder="31.5"
            step="any"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Longitude</label>
          <input
            type="number"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
            placeholder="34.8"
            step="any"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Client</label>
        <input
          type="text"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
          placeholder="Client name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Contact</label>
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
          placeholder="Contact info"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Geofence radius (m)</label>
        <input
          type="text"
          value={geofenceRadiusM}
          onChange={(e) => setGeofenceRadiusM(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
          placeholder="100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Base rate</label>
        <input
          type="text"
          value={baseRate}
          onChange={(e) => setBaseRate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
          placeholder="Base rate"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Grace minutes (missed-checkin alert)</label>
        <input
          type="number"
          value={graceMins}
          onChange={(e) => setGraceMins(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
          placeholder="Default: 10"
          min="0"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Required attributes</label>
        <input
          type="text"
          value={requiredAttributes}
          onChange={(e) => setRequiredAttributes(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
          placeholder="Comma-separated attributes"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
          placeholder="Additional notes"
        />
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        onClick={save}
        disabled={busy}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
