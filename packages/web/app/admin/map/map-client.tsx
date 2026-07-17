'use client';

import { useEffect, useRef } from 'react';
import type { MapMarker } from './page';

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

declare global {
  interface Window { google?: any }
}

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

function fillColor(status: MapMarker['status']): string {
  if (status === 'staffed') return '#10b981';
  if (status === 'needs') return '#ef4444';
  return '#9ca3af';
}

function statusLabel(status: MapMarker['status']): string {
  if (status === 'staffed') return 'Staffed ✓';
  if (status === 'needs') return 'Needs staff ⚠';
  return 'No shifts today';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildInfoHtml(m: MapMarker): string {
  const lines = m.shifts
    .map((s) => {
      const who = s.workers.length
        ? `<div style="color:#6b7280;font-size:11px;margin-left:8px">${s.workers.map((n) => escapeHtml(n)).join(', ')}</div>`
        : `<div style="color:#9ca3af;font-size:11px;margin-left:8px">—</div>`;
      return `<div style="color:#374151;font-size:12px">${s.start}–${s.end} · ${s.assigned}/${s.headcount}</div>${who}`;
    })
    .join('');
  return `
    <div style="min-width:160px;font-family:sans-serif;padding:2px 2px">
      <div style="font-weight:600;font-size:13px;margin-bottom:2px">${escapeHtml(m.name)}</div>
      <div style="font-size:11px;margin-bottom:${m.shifts.length ? '4px' : '0'};color:${fillColor(m.status)}">${statusLabel(m.status)}</div>
      ${lines}
    </div>
  `;
}

// ponytail: static style array, no UI toggle.
const MINIMAL_STYLE = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

export function MapClient({ markers }: { markers: MapMarker[] }) {
  const mapDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!KEY) return;
    let cancelled = false;
    const gmMarkers: any[] = [];
    let mapInstance: any = null;

    (async () => {
      try {
        await loadMaps(KEY);
        if (cancelled || !mapDivRef.current) return;

        const { Map } = await window.google.maps.importLibrary('maps');

        mapInstance = new Map(mapDivRef.current, {
          center: { lat: 31.5, lng: 34.8 },
          zoom: 7,
          styles: MINIMAL_STYLE,
        });

        if (markers.length > 0) {
          const bounds = new window.google.maps.LatLngBounds();
          const infoWindow = new window.google.maps.InfoWindow({ maxWidth: 240 });

          for (const m of markers) {
            bounds.extend({ lat: m.lat, lng: m.lng });

            const marker = new window.google.maps.Marker({
              map: mapInstance,
              position: { lat: m.lat, lng: m.lng },
              title: m.name,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 9,
                fillOpacity: 1,
                fillColor: fillColor(m.status),
                strokeColor: '#fff',
                strokeWeight: 2,
              },
            });

            marker.addListener('click', () => {
              infoWindow.setContent(buildInfoHtml(m));
              infoWindow.open(mapInstance, marker);
            });

            gmMarkers.push(marker);
          }

          mapInstance.fitBounds(bounds);
        }
      } catch (e: any) {
        console.error('Map init failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      for (const m of gmMarkers) m.setMap(null);
      mapInstance = null;
    };
  }, [markers]);

  if (!KEY) {
    return (
      <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        Maps key not configured (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).
      </p>
    );
  }

  return (
    <div>
      {/* Legend */}
      <div className="mb-3 flex items-center gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-[#10b981]" /> Staffed
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-[#ef4444]" /> Needs staff
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-[#9ca3af]" /> No shifts
        </span>
      </div>
      <div ref={mapDivRef} className="h-[70vh] w-full rounded-lg border border-gray-200" />
    </div>
  );
}
