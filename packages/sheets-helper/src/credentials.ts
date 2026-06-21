export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  [k: string]: unknown;
}

export function parseServiceAccountJson(json: string): ServiceAccountCredentials {
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error('Invalid service-account JSON: not parseable');
  }
  const c = obj as Record<string, unknown>;
  if (typeof c.client_email !== 'string' || typeof c.private_key !== 'string') {
    throw new Error('Invalid service-account JSON: missing client_email/private_key');
  }
  return c as ServiceAccountCredentials;
}
