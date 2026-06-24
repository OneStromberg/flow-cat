import { Storage } from '@google-cloud/storage';
import { parseServiceAccountJson } from '@scourage/sheets-helper';

// ── Pure helpers (exported for tests) ─────────────────────────────────────────

export function photoObjectName(key: string, which: 'in' | 'out'): string {
  return `checkins/${key}-${which}.jpg`;
}

export function decodeDataUrl(
  dataUrl: string,
): { buffer: Buffer; contentType: string } | null {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return null;
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  return { buffer, contentType };
}

// ── GCS client (lazy; null when creds missing) ────────────────────────────────

function client(): Storage | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) return null;
  return new Storage({ credentials: parseServiceAccountJson(json) });
}

// ── Upload (best-effort, never throws). Returns the OBJECT NAME, signed on read.
export async function storeCheckinPhoto(
  dataUrl: string | undefined,
  key: string,
  which: 'in' | 'out',
): Promise<string> {
  const bucket = process.env.CHECKIN_PHOTOS_BUCKET;
  if (!bucket || !dataUrl) return '';
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return '';
  try {
    const storage = client();
    if (!storage) return '';
    const name = photoObjectName(key, which);
    await storage.bucket(bucket).file(name).save(decoded.buffer, {
      contentType: decoded.contentType,
      resumable: false,
    });
    return name;
  } catch (err) {
    console.error('[gcs] storeCheckinPhoto failed:', err);
    return '';
  }
}

// ── Signed read URL (private bucket; time-limited). Best-effort → '' on failure.
export async function signedReadUrl(objectName: string): Promise<string> {
  const bucket = process.env.CHECKIN_PHOTOS_BUCKET;
  if (!bucket || !objectName) return '';
  try {
    const storage = client();
    if (!storage) return '';
    const [url] = await storage
      .bucket(bucket)
      .file(objectName)
      .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 15 * 60 * 1000 });
    return url;
  } catch (err) {
    console.error('[gcs] signedReadUrl failed:', err);
    return '';
  }
}
