/**
 * Push subscription endpoints are attacker-influenced strings stored verbatim
 * and later handed to `webpush.sendNotification`, which issues an outbound
 * HTTPS request to whatever host they name. Any authenticated worker (and the
 * missed-checkin cron, which auto-fires on a schedule) can trigger that
 * request — so an unvalidated endpoint is an SSRF primitive against internal
 * infra. This allowlist restricts subscriptions to known push-service hosts.
 * Pure — no I/O.
 */

// Host suffixes for the browser push services we actually support.
// Matched by: exact host === suffix (leading dot stripped), or hostname
// ends with the dotted suffix (i.e. a genuine subdomain, not a spoofed
// lookalike like "fcm.googleapis.com.evil.com").
const ALLOWED_PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  '.push.services.mozilla.com',
  '.push.apple.com',
  '.notify.windows.com',
  '.push.microsoftcloud.com',
  '.wns.windows.com',
];

function hostMatchesSuffix(hostname: string, suffix: string): boolean {
  if (hostname === suffix) return true; // exact host
  if (hostname === suffix.replace(/^\./, '')) return true; // bare domain (suffix has leading dot)
  if (hostname.endsWith(suffix)) return true; // genuine subdomain
  return false;
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  const hostname = url.hostname.toLowerCase();
  return ALLOWED_PUSH_HOST_SUFFIXES.some((suffix) => hostMatchesSuffix(hostname, suffix));
}
