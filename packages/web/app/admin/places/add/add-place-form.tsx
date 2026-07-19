'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type Mode = 'search' | 'pin';
type Selected = { name: string; lat: string; lng: string; placeId: string; address: string };
type Extra = { client: string; contact: string; baseRate: string; geofenceRadiusM: string; requiredAttributes: string; notes: string; graceMins: string };

declare global {
  interface Window { google?: any }
}

// Loads the Maps JS API and resolves only once `importLibrary` is actually
// callable. We poll for readiness instead of trusting script.onload, which with
// loading=async can fire before importLibrary exists. We use ONLY importLibrary
// (no legacy `libraries=` param) — mixing the two loading paths breaks.
function loadMaps(key: string): Promise<void> {
  if (!document.getElementById('gmaps-js')) {
    const s = document.createElement('script');
    s.id = 'gmaps-js';
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly&loading=async`;
    document.head.appendChild(s);
  }
  return new Promise((res, rej) => {
    let n = 0;
    const t = setInterval(() => {
      if (window.google?.maps?.importLibrary) {
        clearInterval(t);
        res();
      } else if (++n > 150) {
        clearInterval(t);
        rej(new Error('Google Maps did not initialize (timeout)'));
      }
    }, 100);
  });
}

function ExtraFields({ extra, setExtra, isAdmin }: { extra: Extra; setExtra: (e: Extra) => void; isAdmin: boolean }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700">Client</label>
        <input
          type="text"
          value={extra.client}
          onChange={(e) => setExtra({ ...extra, client: e.target.value })}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
          placeholder="Client name"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Contact</label>
        <input
          type="text"
          value={extra.contact}
          onChange={(e) => setExtra({ ...extra, contact: e.target.value })}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
          placeholder="Contact info"
        />
      </div>
      {isAdmin && (
        <div>
          <label className="block text-sm font-medium text-gray-700">Billing rate</label>
          <input
            type="text"
            value={extra.baseRate}
            onChange={(e) => setExtra({ ...extra, baseRate: e.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
            placeholder="Billing rate"
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700">Geofence radius (m)</label>
        <input
          type="text"
          value={extra.geofenceRadiusM}
          onChange={(e) => setExtra({ ...extra, geofenceRadiusM: e.target.value })}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
          placeholder="100"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Grace minutes (missed-checkin alert)</label>
        <input
          type="number"
          value={extra.graceMins}
          onChange={(e) => setExtra({ ...extra, graceMins: e.target.value })}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
          placeholder="Default: 10"
          min="0"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Required attributes</label>
        <input
          type="text"
          value={extra.requiredAttributes}
          onChange={(e) => setExtra({ ...extra, requiredAttributes: e.target.value })}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
          placeholder="Comma-separated attributes"
        />
      </div>
    </div>
  );
}

export function AddPlaceForm({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('search');
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [sel, setSel] = useState<Selected | null>(null);
  const [pinName, setPinName] = useState('');
  const [pinLat, setPinLat] = useState('');
  const [pinLng, setPinLng] = useState('');
  const [extra, setExtra] = useState<Extra>({ client: '', contact: '', baseRate: '', geofenceRadiusM: '100', requiredAttributes: '', notes: '', graceMins: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load Maps API once on mount (for both modes)
  useEffect(() => {
    if (!KEY) { setErr('Maps key not configured (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).'); return; }
    loadMaps(KEY)
      .then(() => setMapsReady(true))
      .catch((e: any) => {
        console.error('Maps init failed:', e);
        setErr('Could not load Google Maps: ' + (e?.message ?? String(e)));
      });
  }, []);

  // Search mode: mount PlaceAutocompleteElement
  useEffect(() => {
    if (mode !== 'search' || !mapsReady || !boxRef.current) return;
    let cancelled = false;
    (async () => {
      if (cancelled || !boxRef.current) return;
      const { PlaceAutocompleteElement } = await window.google.maps.importLibrary('places');
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
    })();
    return () => { cancelled = true; };
  }, [mode, mapsReady]);

  // Pin mode: mount Google Map
  useEffect(() => {
    if (mode !== 'pin' || !mapsReady || !mapRef.current) return;
    let cancelled = false;
    (async () => {
      if (cancelled || !mapRef.current) return;
      try {
        const { Map } = await window.google.maps.importLibrary('maps');

        // Try geolocation for initial center
        let center = { lat: 31.5, lng: 34.8 };
        if (navigator.geolocation) {
          await new Promise<void>((res) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => { center = { lat: pos.coords.latitude, lng: pos.coords.longitude }; res(); },
              () => res(),
              { timeout: 2000 }
            );
          });
        }

        const map = new Map(mapRef.current, { center, zoom: 7, disableDefaultUI: false });
        mapInstanceRef.current = map;

        // Create a plain draggable marker (no mapId needed)
        const marker = new window.google.maps.Marker({ map, draggable: true, visible: false });
        markerRef.current = marker;

        function updateCoords(lat: number, lng: number) {
          const latStr = String(lat);
          const lngStr = String(lng);
          setPinLat(latStr);
          setPinLng(lngStr);
          marker.setPosition({ lat, lng });
          marker.setVisible(true);
        }

        map.addListener('click', (e: any) => {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          updateCoords(lat, lng);
        });

        marker.addListener('dragend', (e: any) => {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          setPinLat(String(lat));
          setPinLng(String(lng));
        });
      } catch (e: any) {
        console.error('Map init failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      if (markerRef.current) { markerRef.current.setMap(null); markerRef.current = null; }
      mapInstanceRef.current = null;
    };
  }, [mode, mapsReady]);

  // Sync lat/lng inputs → marker position
  function handleLatChange(val: string) {
    setPinLat(val);
    const lat = parseFloat(val);
    const lng = parseFloat(pinLng);
    if (!isNaN(lat) && !isNaN(lng) && markerRef.current && mapInstanceRef.current) {
      markerRef.current.setPosition({ lat, lng });
      markerRef.current.setVisible(true);
      mapInstanceRef.current.panTo({ lat, lng });
    }
  }

  function handleLngChange(val: string) {
    setPinLng(val);
    const lat = parseFloat(pinLat);
    const lng = parseFloat(val);
    if (!isNaN(lat) && !isNaN(lng) && markerRef.current && mapInstanceRef.current) {
      markerRef.current.setPosition({ lat, lng });
      markerRef.current.setVisible(true);
      mapInstanceRef.current.panTo({ lat, lng });
    }
  }

  async function save() {
    const payload = mode === 'pin'
      ? { name: pinName, lat: pinLat, lng: pinLng, placeId: '', address: '', ...extra }
      : { ...sel!, ...extra };
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  const pinReady = Boolean(pinName && pinLat && pinLng);
  const saveDisabled = mode === 'search' ? (!sel || busy) : (!pinReady || busy);

  return (
    <div className="mt-6 space-y-4">
      {/* Mode toggle */}
      <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm font-medium">
        <button
          type="button"
          onClick={() => { setMode('search'); setErr(null); }}
          className={`flex-1 px-4 py-2 ${mode === 'search' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}
        >
          Search address
        </button>
        <button
          type="button"
          onClick={() => { setMode('pin'); setErr(null); }}
          className={`flex-1 px-4 py-2 ${mode === 'pin' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}
        >
          Drop a pin
        </button>
      </div>

      {/* Search mode */}
      {mode === 'search' && (
        <>
          <label className="block text-sm font-medium text-gray-700">Search address or place</label>
          {!KEY && <p className="text-sm text-red-600">Maps key not configured (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).</p>}
          <div ref={boxRef} />
          {sel && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <div className="font-medium">{sel.name}</div>
              <div className="text-gray-600">{sel.address}</div>
              <div className="text-gray-400">{sel.lat}, {sel.lng}</div>
            </div>
          )}
          {sel && (
            <div className="space-y-3">
              <ExtraFields extra={extra} setExtra={setExtra} isAdmin={isAdmin} />
              <div>
                <label className="block text-sm font-medium text-gray-700">Notes</label>
                <input
                  type="text"
                  value={extra.notes}
                  onChange={(e) => setExtra({ ...extra, notes: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
                  placeholder="Additional notes"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Pin mode */}
      {mode === 'pin' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Place name</label>
            <input
              type="text"
              value={pinName}
              onChange={(e) => setPinName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
              placeholder="Name this place"
            />
          </div>

          {/* Map (only shown when Maps is ready) */}
          {KEY && (
            <div
              ref={mapRef}
              className="w-full rounded-lg border border-gray-300 overflow-hidden"
              style={{ height: 300 }}
            />
          )}
          {KEY && mapsReady && (
            <p className="text-xs text-gray-500">Tap the map to place a pin, or enter coordinates below.</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Latitude</label>
              <input
                type="number"
                value={pinLat}
                onChange={(e) => handleLatChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
                placeholder="31.5"
                step="any"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Longitude</label>
              <input
                type="number"
                value={pinLng}
                onChange={(e) => handleLngChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
                placeholder="34.8"
                step="any"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={extra.notes}
              onChange={(e) => setExtra({ ...extra, notes: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400"
              placeholder="Describe this place…"
            />
          </div>

          <ExtraFields extra={extra} setExtra={setExtra} isAdmin={isAdmin} />
        </div>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        onClick={save}
        disabled={saveDisabled}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save place'}
      </button>
    </div>
  );
}
