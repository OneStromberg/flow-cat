import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySignature(
  rawBody: string,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const got = header.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/.test(got)) return false;
  const a = Buffer.from(got, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}
