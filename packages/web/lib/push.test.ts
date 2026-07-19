import { test } from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import { createMemoryGateway } from '@scourage/sheets-helper';
import { savePushSubscription, listPushSubscriptions, type Worker } from '@scourage/worklog-core';
import { chooseChannel, sendPushToPhone, notifyPhone, isPushConfigured } from './push.ts';

// Real (but throwaway) VAPID keypair: webpush.setVapidDetails validates key shape,
// so a placeholder string like 'test-pub-key' fails validation before we even get
// to the injected `send` stub. Generating a real pair keeps this fully offline/deterministic.
const TEST_VAPID_KEYS = webpush.generateVAPIDKeys();

function gw() {
  return createMemoryGateway({
    PushSubscriptions: [['phone', 'endpoint', 'p256dh', 'auth', 'created_at', 'user_agent', 'active']],
  });
}

function makeSub(endpoint: string) {
  return { endpoint, keys: { p256dh: 'p256dh_' + endpoint, auth: 'auth_' + endpoint } };
}

async function withVapidEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prev = {
    pub: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    priv: process.env.VAPID_PRIVATE_KEY,
    subj: process.env.VAPID_SUBJECT,
  };
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = TEST_VAPID_KEYS.publicKey;
  process.env.VAPID_PRIVATE_KEY = TEST_VAPID_KEYS.privateKey;
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  try {
    return await fn();
  } finally {
    if (prev.pub === undefined) delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = prev.pub;
    if (prev.priv === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = prev.priv;
    if (prev.subj === undefined) delete process.env.VAPID_SUBJECT;
    else process.env.VAPID_SUBJECT = prev.subj;
  }
}

// --- chooseChannel: pure cutover rule ---

test('chooseChannel: hasPush wins regardless of admin/telegram state', () => {
  assert.equal(chooseChannel({ hasPush: true, isAdmin: false, hasTelegramChat: false }), 'push');
  assert.equal(chooseChannel({ hasPush: true, isAdmin: true, hasTelegramChat: true }), 'push');
  assert.equal(chooseChannel({ hasPush: true, isAdmin: true, hasTelegramChat: false }), 'push');
});

test('chooseChannel: no push, admin with linked telegram -> telegram', () => {
  assert.equal(chooseChannel({ hasPush: false, isAdmin: true, hasTelegramChat: true }), 'telegram');
});

test('chooseChannel: no push, admin without linked telegram -> none', () => {
  assert.equal(chooseChannel({ hasPush: false, isAdmin: true, hasTelegramChat: false }), 'none');
});

test('chooseChannel: no push, non-admin worker -> none regardless of telegram flag', () => {
  assert.equal(chooseChannel({ hasPush: false, isAdmin: false, hasTelegramChat: false }), 'none');
  assert.equal(chooseChannel({ hasPush: false, isAdmin: false, hasTelegramChat: true }), 'none');
});

// --- sendPushToPhone: no-op when unconfigured ---

test('sendPushToPhone: no-ops (returns 0, never throws) when VAPID env is unset', async () => {
  assert.equal(isPushConfigured(), false);
  const g = gw();
  await savePushSubscription(g, '0501234567', makeSub('https://push.example/dev1'));
  const sent = await sendPushToPhone(g, '0501234567', { title: 't', body: 'b' });
  assert.equal(sent, 0);
});

// --- sendPushToPhone: prune-on-410, best-effort ---

test('sendPushToPhone: prunes the 410 endpoint, keeps the good one, returns success count', async () => {
  await withVapidEnv(async () => {
    assert.equal(isPushConfigured(), true);
    const g = gw();
    const badEndpoint = 'https://push.example/gone';
    const goodEndpoint = 'https://push.example/alive';
    await savePushSubscription(g, '0501234567', makeSub(badEndpoint));
    await savePushSubscription(g, '0501234567', makeSub(goodEndpoint));

    const calledEndpoints: string[] = [];
    const sent = await sendPushToPhone(
      g,
      '0501234567',
      { title: 'FlowCat', body: 'hi' },
      {
        send: async (sub) => {
          calledEndpoints.push(sub.endpoint);
          if (sub.endpoint === badEndpoint) return { statusCode: 410 };
          return { statusCode: 201 };
        },
      },
    );

    assert.equal(sent, 1);
    assert.deepEqual(calledEndpoints.sort(), [badEndpoint, goodEndpoint].sort());

    const remaining = await listPushSubscriptions(g, '0501234567');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].endpoint, goodEndpoint);
  });
});

test('sendPushToPhone: a thrown per-endpoint error does not abort the others', async () => {
  await withVapidEnv(async () => {
    const g = gw();
    const throwsEndpoint = 'https://push.example/throws';
    const okEndpoint = 'https://push.example/ok';
    await savePushSubscription(g, '0501234567', makeSub(throwsEndpoint));
    await savePushSubscription(g, '0501234567', makeSub(okEndpoint));

    const sent = await sendPushToPhone(
      g,
      '0501234567',
      { title: 'FlowCat', body: 'hi' },
      {
        send: async (sub) => {
          if (sub.endpoint === throwsEndpoint) throw new Error('network blew up');
          return { statusCode: 201 };
        },
      },
    );

    // non-404/410 throw: not pruned, not counted as sent; the other endpoint still succeeds
    assert.equal(sent, 1);
    const remaining = await listPushSubscriptions(g, '0501234567');
    assert.equal(remaining.length, 2);
  });
});

test('sendPushToPhone: a thrown error carrying statusCode 404 also prunes', async () => {
  await withVapidEnv(async () => {
    const g = gw();
    const endpoint = 'https://push.example/dev1';
    await savePushSubscription(g, '0501234567', makeSub(endpoint));

    const sent = await sendPushToPhone(
      g,
      '0501234567',
      { title: 'FlowCat', body: 'hi' },
      {
        send: async () => {
          const err = Object.assign(new Error('gone'), { statusCode: 404 });
          throw err;
        },
      },
    );

    assert.equal(sent, 0);
    const remaining = await listPushSubscriptions(g, '0501234567');
    assert.equal(remaining.length, 0);
  });
});

// --- notifyPhone: routing ---

function makeWorker(overrides: Partial<Worker>): Worker {
  return {
    phone: '0501234567',
    name: 'Test Worker',
    greeting: 'hi',
    places: [],
    active: true,
    teudatZeut: '',
    ...overrides,
  };
}

test('notifyPhone: subscribed worker routes to push', async () => {
  await withVapidEnv(async () => {
    const g = gw();
    await savePushSubscription(g, '0501234567', makeSub('https://push.example/dev1'));
    const worker = makeWorker({ phone: '0501234567', admin: false });

    const channel = await notifyPhone(g, worker, 'hello', {
      url: '/app',
    });
    assert.equal(channel, 'push');
  });
});

test('notifyPhone: unsubscribed admin with linked telegram routes to telegram (no throw even though TELEGRAM_BOT_TOKEN is unset)', async () => {
  const g = gw();
  const worker = makeWorker({ phone: '0509999999', admin: true, telegramChatId: '12345' });

  const channel = await notifyPhone(g, worker, 'missed check-in');
  assert.equal(channel, 'telegram');
});

test('notifyPhone: unsubscribed non-admin worker routes to none', async () => {
  const g = gw();
  const worker = makeWorker({ phone: '0508888888', admin: false });

  const channel = await notifyPhone(g, worker, 'missed check-in');
  assert.equal(channel, 'none');
});

// --- notifyPhone: delivery fallback (push -> telegram when every device fails) ---

const alwaysFailSend = {
  send: async () => {
    throw new Error('device unreachable');
  },
};

test('notifyPhone: subscribed admin whose push send fails everywhere falls back to telegram', async () => {
  await withVapidEnv(async () => {
    const g = gw();
    await savePushSubscription(g, '0501234567', makeSub('https://push.example/dead'));
    const worker = makeWorker({ phone: '0501234567', admin: true, telegramChatId: '12345' });

    const channel = await notifyPhone(g, worker, 'missed check-in', undefined, alwaysFailSend);
    assert.equal(channel, 'telegram');
  });
});

test('notifyPhone: subscribed non-admin worker whose push send fails everywhere gets no fallback (stays push)', async () => {
  await withVapidEnv(async () => {
    const g = gw();
    await savePushSubscription(g, '0501234567', makeSub('https://push.example/dead'));
    const worker = makeWorker({ phone: '0501234567', admin: false });

    const channel = await notifyPhone(g, worker, 'missed check-in', undefined, alwaysFailSend);
    assert.equal(channel, 'push');
  });
});

test('notifyPhone: subscribed admin whose push send fails everywhere but has no linked telegram gets no fallback (stays push)', async () => {
  await withVapidEnv(async () => {
    const g = gw();
    await savePushSubscription(g, '0501234567', makeSub('https://push.example/dead'));
    const worker = makeWorker({ phone: '0501234567', admin: true, telegramChatId: '' });

    const channel = await notifyPhone(g, worker, 'missed check-in', undefined, alwaysFailSend);
    assert.equal(channel, 'push');
  });
});

// --- ensureVapidConfigured: malformed VAPID key no-ops instead of throwing ---

test('sendPushToPhone: malformed VAPID public key no-ops (returns 0, never throws)', async () => {
  const prev = {
    pub: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    priv: process.env.VAPID_PRIVATE_KEY,
    subj: process.env.VAPID_SUBJECT,
  };
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'not-a-valid-vapid-key';
  process.env.VAPID_PRIVATE_KEY = 'also-not-valid';
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  try {
    const g = gw();
    await savePushSubscription(g, '0501234567', makeSub('https://push.example/dev1'));
    const sent = await sendPushToPhone(g, '0501234567', { title: 't', body: 'b' });
    assert.equal(sent, 0);
  } finally {
    if (prev.pub === undefined) delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = prev.pub;
    if (prev.priv === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = prev.priv;
    if (prev.subj === undefined) delete process.env.VAPID_SUBJECT;
    else process.env.VAPID_SUBJECT = prev.subj;
  }
});
