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

// ── S4: boundary + error-path cases ───────────────────────────────────────
test('photoZipEntryName strips unsafe filename chars and collapses runs (incl. spaces) to a single dash', () => {
  const name = photoZipEntryName('2026-07-01T05:05:00.000Z', 'Asia/Jerusalem', 'Ana   Test/Name!!', 'in');
  assert.equal(name, '2026-07-01_08-05_Ana-Test-Name_in.jpg');
});

test('buildStoreZip([]) returns exactly a 22-byte End-Of-Central-Directory record', () => {
  const zip = buildStoreZip([]);
  assert.equal(zip.length, 22);
  assert.equal(zip.readUInt32LE(0), 0x06054b50); // EOCD signature at offset 0
});

test('buildStoreZip with two entries emits two local file headers', () => {
  const zip = buildStoreZip([
    { name: 'a.jpg', data: Buffer.from('hello') },
    { name: 'b.jpg', data: Buffer.from('world!') },
  ]);
  const sig = Buffer.alloc(4);
  sig.writeUInt32LE(0x04034b50, 0);
  let count = 0;
  let idx = zip.indexOf(sig);
  while (idx !== -1) {
    count++;
    idx = zip.indexOf(sig, idx + 1);
  }
  assert.equal(count, 2);
  assert.ok(zip.includes(Buffer.from('a.jpg')));
  assert.ok(zip.includes(Buffer.from('b.jpg')));
});
