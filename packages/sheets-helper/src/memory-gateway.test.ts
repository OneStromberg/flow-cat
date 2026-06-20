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
