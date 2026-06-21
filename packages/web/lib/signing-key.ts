import { createHmac } from 'node:crypto';
import { parseServiceAccountJson } from '@scourage/sheets-helper';

/** Choose/derive the session signing key. SESSION_SECRET wins; else derive from the SA key. */
export function deriveSigningKey(sessionSecret: string | undefined, serviceAccountJson: string | undefined): string {
  if (sessionSecret) return sessionSecret;
  if (!serviceAccountJson) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON');
  const creds = parseServiceAccountJson(serviceAccountJson);
  return createHmac('sha256', creds.private_key).update('flowcat-session').digest('base64url');
}
