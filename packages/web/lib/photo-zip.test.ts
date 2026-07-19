import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoZipEntryName, buildStoreZip } from './gcs';

test('photoZipEntryName encodes Jerusalem date+time, worker, leg', () => {
  assert.equal(
    photoZipEntryName('2026-07-01T05:05:00.000Z', 'Asia/Jerusalem', 'Victor Ivanov', 'in'),
    '2026-07-01_08-05_Victor-Ivanov_in.jpg',
  );
});
test('buildStoreZip produces a valid ZIP signature + central dir', () => {
  const zip = buildStoreZip([{ name: 'a.jpg', data: Buffer.from('hello') }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);   // local file header
  assert.ok(zip.includes(Buffer.from('a.jpg')));
  assert.equal(buildStoreZip([]).readUInt32LE(0), 0x06054b50); // empty → EOCD only
});
