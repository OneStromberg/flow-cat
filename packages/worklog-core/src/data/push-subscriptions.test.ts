import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from '@scourage/sheets-helper';
import {
  savePushSubscription,
  listPushSubscriptions,
  listAllPushSubscriptions,
  hasPushSubscription,
  deactivatePushSubscription,
  type PushSub,
} from './push-subscriptions.ts';

function gw() {
  return createMemoryGateway({
    PushSubscriptions: [['phone', 'endpoint', 'p256dh', 'auth', 'created_at', 'user_agent', 'active']],
  });
}

function makeSub(endpoint: string): PushSub {
  return { endpoint, keys: { p256dh: 'p256dh_' + endpoint, auth: 'auth_' + endpoint } };
}

test('savePushSubscription then listPushSubscriptions returns it for that worker', async () => {
  const g = gw();
  const sub = makeSub('https://push.example/dev1');
  await savePushSubscription(g, '0501234567', sub, 'ua-1', '2026-07-19T00:00:00.000Z');
  const subs = await listPushSubscriptions(g, '0501234567');
  assert.equal(subs.length, 1);
  assert.equal(subs[0].endpoint, sub.endpoint);
  assert.equal(subs[0].keys.p256dh, sub.keys.p256dh);
  assert.equal(subs[0].keys.auth, sub.keys.auth);
});

test('savePushSubscription upserts by endpoint — resaving does not duplicate', async () => {
  const g = gw();
  const endpoint = 'https://push.example/dev1';
  await savePushSubscription(g, '0501234567', makeSub(endpoint), 'ua-1');
  await savePushSubscription(g, '0501234567', makeSub(endpoint), 'ua-2');
  const subs = await listPushSubscriptions(g, '0501234567');
  assert.equal(subs.length, 1);
  const rows = await g.readTab('PushSubscriptions');
  assert.equal(rows.length, 2); // header + 1 row, no append on second save
});

test('savePushSubscription upsert re-activates a soft-deleted row', async () => {
  const g = gw();
  const endpoint = 'https://push.example/dev1';
  await savePushSubscription(g, '0501234567', makeSub(endpoint));
  await deactivatePushSubscription(g, endpoint);
  assert.equal((await listPushSubscriptions(g, '0501234567')).length, 0);
  await savePushSubscription(g, '0501234567', makeSub(endpoint));
  const subs = await listPushSubscriptions(g, '0501234567');
  assert.equal(subs.length, 1);
  const rows = await g.readTab('PushSubscriptions');
  assert.equal(rows.length, 2); // still just header + 1 row
});

test('listPushSubscriptions excludes another worker\'s subs and inactive ones', async () => {
  const g = gw();
  await savePushSubscription(g, '0501234567', makeSub('https://push.example/dev1'));
  await savePushSubscription(g, '0507654321', makeSub('https://push.example/dev2'));
  const inactiveEndpoint = 'https://push.example/dev3';
  await savePushSubscription(g, '0501234567', makeSub(inactiveEndpoint));
  await deactivatePushSubscription(g, inactiveEndpoint);

  const subs = await listPushSubscriptions(g, '0501234567');
  assert.equal(subs.length, 1);
  assert.equal(subs[0].endpoint, 'https://push.example/dev1');
});

test('hasPushSubscription true/false', async () => {
  const g = gw();
  assert.equal(await hasPushSubscription(g, '0501234567'), false);
  await savePushSubscription(g, '0501234567', makeSub('https://push.example/dev1'));
  assert.equal(await hasPushSubscription(g, '0501234567'), true);
});

test('deactivatePushSubscription drops it out of listPushSubscriptions (soft-delete, no row removal)', async () => {
  const g = gw();
  const endpoint = 'https://push.example/dev1';
  await savePushSubscription(g, '0501234567', makeSub(endpoint));
  assert.equal((await listPushSubscriptions(g, '0501234567')).length, 1);

  await deactivatePushSubscription(g, endpoint);
  assert.equal((await listPushSubscriptions(g, '0501234567')).length, 0);

  const rows = await g.readTab('PushSubscriptions');
  assert.equal(rows.length, 2); // header + 1 row still present
  const header = rows[0];
  assert.equal(rows[1][header.indexOf('active')], 'no');
});

test('deactivatePushSubscription is a no-op when the endpoint is not found', async () => {
  const g = gw();
  await savePushSubscription(g, '0501234567', makeSub('https://push.example/dev1'));
  await deactivatePushSubscription(g, 'https://push.example/does-not-exist');
  const subs = await listPushSubscriptions(g, '0501234567');
  assert.equal(subs.length, 1);
});

test('phone normalization: a 05... save is found by a 972... lookup', async () => {
  const g = gw();
  await savePushSubscription(g, '0501234567', makeSub('https://push.example/dev1'));
  const subs = await listPushSubscriptions(g, '972501234567');
  assert.equal(subs.length, 1);
});

test('phone normalization: a 972... save is found by a 05... lookup', async () => {
  const g = gw();
  await savePushSubscription(g, '972501234567', makeSub('https://push.example/dev1'));
  const subs = await listPushSubscriptions(g, '0501234567');
  assert.equal(subs.length, 1);
});

// --- Ownership / IDOR guards ---

test('deactivatePushSubscription with a non-matching phone is a no-op', async () => {
  const g = gw();
  const endpoint = 'https://push.example/dev1';
  await savePushSubscription(g, '0501234567', makeSub(endpoint));

  await deactivatePushSubscription(g, endpoint, '0509999999');

  const subs = await listPushSubscriptions(g, '0501234567');
  assert.equal(subs.length, 1);
  assert.equal(subs[0].endpoint, endpoint);
});

test('deactivatePushSubscription with the matching (owning) phone still deactivates', async () => {
  const g = gw();
  const endpoint = 'https://push.example/dev1';
  await savePushSubscription(g, '0501234567', makeSub(endpoint));

  await deactivatePushSubscription(g, endpoint, '0501234567');

  assert.equal((await listPushSubscriptions(g, '0501234567')).length, 0);
});

test('deactivatePushSubscription with a matching phone in a different normalized form still deactivates', async () => {
  const g = gw();
  const endpoint = 'https://push.example/dev1';
  await savePushSubscription(g, '0501234567', makeSub(endpoint));

  await deactivatePushSubscription(g, endpoint, '972501234567');

  assert.equal((await listPushSubscriptions(g, '0501234567')).length, 0);
});

test('savePushSubscription for an endpoint already owned by another worker deactivates the stale row and creates a fresh one for the caller', async () => {
  const g = gw();
  const endpoint = 'https://push.example/shared-device';
  await savePushSubscription(g, '0501234567', makeSub(endpoint)); // worker A claims it first

  // worker B saves the same endpoint (device changed hands)
  await savePushSubscription(g, '0507654321', makeSub(endpoint));

  const aSubs = await listPushSubscriptions(g, '0501234567');
  assert.equal(aSubs.length, 0); // A's row no longer returned (deactivated)

  const bSubs = await listPushSubscriptions(g, '0507654321');
  assert.equal(bSubs.length, 1);
  assert.equal(bSubs[0].endpoint, endpoint);

  const rows = await g.readTab('PushSubscriptions');
  assert.equal(rows.length, 3); // header + A's stale row + B's new row
  const header = rows[0];
  const aRow = rows.find((r, i) => i > 0 && r[header.indexOf('phone')] === '972501234567');
  assert.equal(aRow?.[header.indexOf('active')], 'no');
});

test('savePushSubscription for an endpoint already owned by the same worker keeps upserting in place (no duplicate row)', async () => {
  const g = gw();
  const endpoint = 'https://push.example/dev1';
  await savePushSubscription(g, '0501234567', makeSub(endpoint), 'ua-1');
  await savePushSubscription(g, '972501234567', makeSub(endpoint), 'ua-2'); // same worker, different phone form

  const subs = await listPushSubscriptions(g, '0501234567');
  assert.equal(subs.length, 1);
  const rows = await g.readTab('PushSubscriptions');
  assert.equal(rows.length, 2); // header + 1 row, no append
});

test('listAllPushSubscriptions returns all active subs across workers, excludes inactive', async () => {
  const g = gw();
  await savePushSubscription(g, '0501234567', makeSub('https://push.example/dev1'));
  await savePushSubscription(g, '0507654321', makeSub('https://push.example/dev2'));
  const inactiveEndpoint = 'https://push.example/dev3';
  await savePushSubscription(g, '0501234567', makeSub(inactiveEndpoint));
  await deactivatePushSubscription(g, inactiveEndpoint);

  const all = await listAllPushSubscriptions(g);
  assert.equal(all.length, 2);
  const endpoints = all.map((a) => a.sub.endpoint).sort();
  assert.deepEqual(endpoints, ['https://push.example/dev1', 'https://push.example/dev2']);
  const dev1 = all.find((a) => a.sub.endpoint === 'https://push.example/dev1');
  assert.equal(dev1?.phone, '972501234567');
});
