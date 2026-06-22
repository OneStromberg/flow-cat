'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type Selected = { name: string; lat: string; lng: string; placeId: string; address: string };

declare global {
  interface Window { google?: any }
}

function loadMaps(key: string): Promise<any> {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google);
  const existing = document.getElementById('gmaps-js') as HTMLScriptElement | null;
  if (existing) return new Promise((res) => existing.addEventListener('load', () => res(window.google)));
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.id = 'gmaps-js';
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async&v=weekly`;
    s.onload = () => res(window.google);
    s.onerror = () => rej(new Error('maps load failed'));
    document.head.appendChild(s);
  });
}

export function AddPlaceForm() {
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Selected | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!KEY) { setErr('Maps key not configured (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).'); return; }
    let cancelled = false;
    loadMaps(KEY)
      .then(async (google) => {
        if (cancelled || !boxRef.current) return;
        const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
        const el = new PlaceAutocompleteElement();
        el.style.width = '100%';
        boxRef.current.innerHTML = '';
        boxRef.current.appendChild(el);
        el.addEventListener('gmp-select', async (e: any) => {
          const place = e.placePrediction.toPlace();
          await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'id'] });
          setSel({
            name: place.displayName ?? '',
            address: place.formattedAddress ?? '',
            lat: place.location ? String(place.location.lat()) : '',
            lng: place.location ? String(place.location.lng()) : '',
            placeId: place.id ?? '',
          });
        });
      })
      .catch(() => setErr('Could not load Google Maps. Check the API key and its restrictions.'));
    return () => { cancelled = true; };
  }, []);

  async function save() {
    if (!sel) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sel),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        router.replace('/admin/places');
        router.refresh();
      } else if (res.status === 400 && data.errors) {
        setErr(Object.values(data.errors)[0] as string);
        setBusy(false);
      } else {
        setErr('Could not save. Please try again.');
        setBusy(false);
      }
    } catch {
      setErr('Network error. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <label className="block text-sm font-medium text-gray-700">Search address or place</label>
      <div ref={boxRef} />
      {sel && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
          <div className="font-medium">{sel.name}</div>
          <div className="text-gray-600">{sel.address}</div>
          <div className="text-gray-400">{sel.lat}, {sel.lng}</div>
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        onClick={save}
        disabled={!sel || busy}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save place'}
      </button>
    </div>
  );
}
