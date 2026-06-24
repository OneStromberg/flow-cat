import { Readable } from 'node:stream';
import { google } from 'googleapis';
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

// ── Upload (best-effort, never throws) ────────────────────────────────────────

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
    const { buffer, contentType } = decoded;
    const name = photoObjectName(key, which);

    const credentials = parseServiceAccountJson(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON!,
    );
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });

    await google.storage('v1').objects.insert({
      bucket,
      name,
      media: {
        mimeType: contentType,
        body: Readable.from(buffer),
      },
      auth,
      requestBody: {},
    });

    return `https://storage.googleapis.com/${bucket}/${name}`;
  } catch (err) {
    console.error('[gcs] storeCheckinPhoto failed:', err);
    return '';
  }
}
