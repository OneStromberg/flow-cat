// External store for PWA install state — see `next.config.ts` and
// `app/layout.tsx` for the pre-hydration `beforeinstallprompt` capture this
// module seeds from.
//
// Why this exists: the custom install button used to register its own
// `beforeinstallprompt` listener inside a component `useEffect`. That loses
// the race whenever Chrome fires the event before React hydrates (e.g. a cold
// load) — the native install popup shows because nobody called
// `preventDefault()` in time. Now an inline `<script>` in the root layout
// captures + suppresses the event as early as possible (before any
// JavaScript bundle, including this one, has even loaded), stashing it on
// `window.__bipEvent`. This module seeds itself from that stash on load, then
// takes over listening for the rest of the page's lifetime. Because it lives
// at module scope (not inside a component), it also works no matter which
// page mounts first — the button component becomes a stateless subscriber.

// Chromium fires this before showing the native install prompt; not in the
// standard DOM lib.
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __bipEvent?: BeforeInstallPromptEvent;
  }
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

type Listener = () => void;

const listeners = new Set<Listener>();

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;

function emit() {
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  // The inline pre-hydration script (app/layout.tsx) may have already
  // captured + preventDefault()'d the event before this module ever ran.
  if (window.__bipEvent) {
    deferredPrompt = window.__bipEvent;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

/** Subscribe to install-state changes. Returns an unsubscribe function. */
export function subscribe(callback: Listener): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Snapshot: the raw deferred prompt, if one is currently stashed. */
export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

/** Snapshot: whether a `beforeinstallprompt` is currently available to fire. */
export function hasPrompt(): boolean {
  return deferredPrompt !== null;
}

/** Snapshot: whether the app has been installed this session. */
export function getInstalled(): boolean {
  return installed;
}

/** Stable server snapshot for `useSyncExternalStore` — never installed/available during SSR. */
export function getServerSnapshot(): boolean {
  return false;
}

/**
 * Fire the stashed native install prompt and await the user's choice.
 * Clears the prompt afterward either way (a `BeforeInstallPromptEvent` can
 * only be used once).
 */
export async function triggerInstall(): Promise<InstallOutcome> {
  const prompt = deferredPrompt;
  if (!prompt) return 'unavailable';
  await prompt.prompt();
  const choice = await prompt.userChoice;
  deferredPrompt = null;
  if (choice.outcome === 'accepted') installed = true;
  emit();
  return choice.outcome;
}
