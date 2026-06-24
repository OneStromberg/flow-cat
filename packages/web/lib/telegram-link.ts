import { createHmac } from 'node:crypto';
function sig(phone: string, key: string): string {
  return createHmac('sha256', key).update(phone).digest('base64url').slice(0, 16);
}
export function makeLinkToken(phone: string, key: string): string {
  return Buffer.from(`${phone}:${sig(phone, key)}`).toString('base64url');
}
export function verifyLinkToken(token: string, key: string): string | null {
  try {
    const [phone, s] = Buffer.from(token, 'base64url').toString('utf8').split(':');
    if (phone && s && sig(phone, key) === s) return phone;
  } catch { /* fall through */ }
  return null;
}
