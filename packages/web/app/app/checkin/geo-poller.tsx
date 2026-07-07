'use client';

import { useEffect } from 'react';

// ponytail: foreground-only; browsers can't poll GPS in the background — timers pause when the tab is suspended.
export function GeoPoller({ instanceId }: { instanceId: string }) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function schedule(ms: number) {
      if (!cancelled) timer = setTimeout(poll, ms);
    }

    function poll() {
      if (cancelled || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (cancelled) return;
          let nextPollMs = 1_800_000;
          try {
            const res = await fetch('/api/geo/ping', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instanceId,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (typeof data?.nextPollMs === 'number' && data.nextPollMs > 0) {
              nextPollMs = data.nextPollMs;
            }
          } catch {
            /* keep default cadence */
          }
          schedule(nextPollMs);
        },
        (err: GeolocationPositionError) => {
          if (cancelled) return;
          // Stop only on real permission denial; transient TIMEOUT / POSITION_UNAVAILABLE → keep trying at default cadence.
          if (err.code !== err.PERMISSION_DENIED) schedule(1_800_000);
        },
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
      );
    }

    timer = setTimeout(poll, 5_000); // first poll shortly after mount

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [instanceId]);

  return <p className="mt-2 text-xs text-gray-400">📍 Location monitoring on for this shift.</p>;
}
