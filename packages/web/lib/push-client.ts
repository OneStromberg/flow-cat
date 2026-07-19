// Pure browser-side push helpers. Kept separate from the client component so the
// conversion logic is unit-testable without a DOM (mirrors lib/pwa-install.ts).

/**
 * Converts a URL-safe base64 VAPID public key (as issued by `web-push`'s
 * `generateVAPIDKeys()`) into the `Uint8Array` shape `PushManager.subscribe`
 * requires for `applicationServerKey`.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64Safe);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
