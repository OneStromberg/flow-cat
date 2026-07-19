// Pure platform/state detection for the PWA install button. No DOM access — the
// caller passes in the bits it reads from `navigator` + `matchMedia` so this can
// be unit-tested without a browser. The live <InstallButton/> composes this with
// `beforeinstallprompt` / `appinstalled` events the helper can't model.

export type InstallPlatform = 'installed' | 'android' | 'ios' | 'unsupported';

/**
 * Decide how (or whether) to offer install for the current environment.
 *
 * - `installed`   — already running as an installed app (standalone display, or
 *                   iOS Safari's `navigator.standalone === true`).
 * - `ios`         — an iOS device (iPhone/iPad/iPod, WebKit) not yet installed →
 *                   show the manual "Add to Home Screen" guide (no programmatic install).
 * - `android`     — Android with a Chromium engine → candidate for `beforeinstallprompt`.
 * - `unsupported` — desktop, Firefox mobile, and anything else → no button.
 */
export function detectPlatform(
  nav: { userAgent: string; standalone?: boolean },
  isStandaloneDisplay: boolean,
): InstallPlatform {
  if (isStandaloneDisplay || nav.standalone === true) return 'installed';

  const ua = nav.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua) && /chrome/i.test(ua)) return 'android';
  return 'unsupported';
}
