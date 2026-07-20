import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGateway } from './memory-gateway.ts';

test('memory gateway reads seeded tabs', async () => {
  const g = createMemoryGateway({ Places: [['place_name'], ['Warehouse']] });
  assert.deepEqual(await g.readTab('Places'), [['place_name'], ['Warehouse']]);
  assert.deepEqual(await g.readTab('Missing'), []);
});

test('memory gateway appends rows and writes header', async () => {
  const g = createMemoryGateway({ WorkLogs: [['phone']] });
  await g.writeHeaderRow('WorkLogs', ['phone', 'name']);
  await g.appendRow('WorkLogs', ['555', 'John']);
  assert.deepEqual(g.dump().WorkLogs, [['phone', 'name'], ['555', 'John']]);
});

test('memory gateway updates a specific row', async () => {
  const g = createMemoryGateway({ WorkLogs: [['id', 'name'], ['a', 'John'], ['b', 'Maria']] });
  await g.updateRow('WorkLogs', 3, ['b', 'Maria Updated']);
  assert.deepEqual(g.dump().WorkLogs, [['id', 'name'], ['a', 'John'], ['b', 'Maria Updated']]);
});

test('tryClaim: first claim wins, immediate re-claim within ttl fails, re-claimable after ttl', async () => {
  const g = createMemoryGateway();
  assert.equal(await g.tryClaim('k', 60000, 1000), true);
  assert.equal(await g.tryClaim('k', 60000, 1000), false);
  assert.equal(await g.tryClaim('k', 60000, 61001), true);
});

test('tryClaim: different keys are independent', async () => {
  const g = createMemoryGateway();
  assert.equal(await g.tryClaim('k', 60000, 1000), true);
  assert.equal(await g.tryClaim('k2', 60000, 1000), true);
});

test('tryClaim: race — two concurrent claims at the same nowMs, exactly one wins', async () => {
  const g = createMemoryGateway();
  const results = await Promise.all([
    g.tryClaim('race', 60000, 5000),
    g.tryClaim('race', 60000, 5000),
  ]);
  const trues = results.filter((r) => r === true).length;
  const falses = results.filter((r) => r === false).length;
  assert.equal(trues, 1);
  assert.equal(falses, 1);
});
