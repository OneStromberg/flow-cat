import { createHmac, timingSafeEqual } from 'node:crypto';

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function createSession(phone: string, key: string): string {
  const payload = Buffer.from(JSON.stringify({ phone })).toString('base64url');
  return `${payload}.${sign(payload, key)}`;
}

export function readSession(value: string, key: string): { phone: string } | null {
  if (!value || !value.includes('.')) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0 || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (obj && typeof obj.phone === 'string' && obj.phone) return { phone: obj.phone };
    return null;
  } catch {
    return null;
  }
}
