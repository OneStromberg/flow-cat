import 'server-only';
import { cookies } from 'next/headers';
import { createSession, readSession, findWorker, type Worker } from '@scourage/worklog-core';
import { getGateway } from './sheets';
import { deriveSigningKey } from './signing-key';

export const COOKIE_NAME = 'fc_session';

export function getSigningKey(): string {
  return deriveSigningKey(process.env.SESSION_SECRET, process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

export async function setSessionCookie(phone: string): Promise<void> {
  const value = createSession(phone, getSigningKey());
  (await cookies()).set(COOKIE_NAME, value, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(COOKIE_NAME, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function requireWorker(): Promise<Worker | null> {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value) return null;
  const session = readSession(value, getSigningKey());
  if (!session) return null;
  return findWorker(getGateway(), session.phone);
}

export async function requireAdmin(): Promise<Worker | null> {
  const worker = await requireWorker();
  if (!worker || !worker.active || worker.admin !== true) return null;
  return worker;
}
