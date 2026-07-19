import { Storage } from '@google-cloud/storage';
import { parseServiceAccountJson } from '@scourage/sheets-helper';
import { formatHmInTz } from './format-time';

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

// ── Photo ZIP export (admin-only) ─────────────────────────────────────────────

export function photoZipEntryName(dateIso: string, tz: string, worker: string, which: 'in' | 'out'): string {
  const t = Date.parse(dateIso);
  const day = Number.isFinite(t)
    ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t))
    : 'unknown';
  const hm = (formatHmInTz(dateIso, tz) || '00:00').replace(':', '-');
  const safeWorker = (worker || 'worker').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'worker';
  return `${day}_${hm}_${safeWorker}_${which}.jpg`;
}

export async function downloadPhoto(objectName: string): Promise<Buffer | null> {
  const bucket = process.env.CHECKIN_PHOTOS_BUCKET;
  if (!bucket || !objectName) return null;
  try {
    const storage = client();
    if (!storage) return null;
    const [buf] = await storage.bucket(bucket).file(objectName).download();
    return buf;
  } catch (err) {
    console.error('[gcs] downloadPhoto failed:', err);
    return null;
  }
}

// Minimal STORE-only ZIP (method 0, no compression). No dependency.
export function buildStoreZip(entries: { name: string; data: Buffer }[]): Buffer {
  const crc32 = (buf: Buffer): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(e.data.length, 18); local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, e.data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8); cen.writeUInt16LE(0, 10); cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(e.data.length, 20); cen.writeUInt32LE(e.data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + e.data.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}
