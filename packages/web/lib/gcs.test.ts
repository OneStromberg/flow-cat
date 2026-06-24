import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeDataUrl, photoObjectName } from './gcs.ts';

test('photoObjectName namespaces by attendance key', () => {
  assert.equal(photoObjectName('att_abc', 'in'), 'checkins/att_abc-in.jpg');
});

test('decodeDataUrl parses a base64 image data url', () => {
  const out = decodeDataUrl('data:image/jpeg;base64,' + Buffer.from('hi').toString('base64'));
  assert.ok(out && out.buffer.toString() === 'hi' && out.contentType === 'image/jpeg');
  assert.equal(decodeDataUrl('not-a-data-url'), null);
});
