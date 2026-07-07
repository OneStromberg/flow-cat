import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreGateway } from './firestore-gateway.ts';

// ---------------------------------------------------------------------------
// Minimal in-memory Firestore FAKE
// ---------------------------------------------------------------------------

interface DocData {
  [key: string]: unknown;
}

function makeFakeFirestore() {
  // All doc data keyed by full path, e.g. "sheets/Workers" or "sheets/Workers/rows/000000001"
  const store = new Map<string, DocData>();

  // Serialize transactions: each runTransaction call awaits the previous one.
  let txChain: Promise<void> = Promise.resolve();

  function makeDocRef(path: string) {
    return {
      path,
      collection(subName: string) {
        return makeCollRef(`${path}/${subName}`);
      },
      async set(data: DocData, opts?: { merge?: boolean }) {
        if (opts?.merge) {
          const existing = store.get(path) ?? {};
          store.set(path, { ...existing, ...data });
        } else {
          store.set(path, { ...data });
        }
      },
      async get() {
        const data = store.get(path);
        return {
          exists: data !== undefined,
          data() {
            return data;
          },
        };
      },
    };
  }

  function makeCollRef(collPath: string) {
    return {
      doc(id: string) {
        return makeDocRef(`${collPath}/${id}`);
      },
      orderBy(field: string) {
        return {
          async get() {
            const prefix = `${collPath}/`;
            const docs: Array<{ data(): DocData }> = [];
            for (const [path, data] of store.entries()) {
              if (path.startsWith(prefix) && !path.slice(prefix.length).includes('/')) {
                docs.push({ data: () => data });
              }
            }
            docs.sort((a, b) => {
              const av = a.data()[field];
              const bv = b.data()[field];
              if (av === undefined && bv === undefined) return 0;
              if (av === undefined) return -1;
              if (bv === undefined) return 1;
              return (av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0;
            });
            return { docs };
          },
        };
      },
    };
  }

  const db = {
    collection(name: string) {
      return makeCollRef(name);
    },
    runTransaction(fn: (tx: TxLike) => Promise<void>): Promise<void> {
      // Serialize: chain onto the previous transaction so appends are atomic.
      txChain = txChain.then(() => {
        const tx: TxLike = {
          async get(ref: ReturnType<typeof makeDocRef>) {
            return ref.get();
          },
          set(ref: ReturnType<typeof makeDocRef>, data: DocData, opts?: { merge?: boolean }) {
            // Synchronous within the transaction (applied immediately to store).
            if (opts?.merge) {
              const existing = store.get(ref.path) ?? {};
              store.set(ref.path, { ...existing, ...data });
            } else {
              store.set(ref.path, { ...data });
            }
          },
        };
        return fn(tx);
      });
      return txChain;
    },
  };

  return db;
}

interface TxLike {
  get(ref: { path: string; get(): Promise<{ exists: boolean; data(): DocData | undefined }> }): Promise<{
    exists: boolean;
    data(): DocData | undefined;
  }>;
  set(
    ref: { path: string },
    data: DocData,
    opts?: { merge?: boolean },
  ): void;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createFirestoreGateway', () => {
  it('missing tab reads empty', async () => {
    const g = createFirestoreGateway({
      projectId: 'p',
      credentials: { client_email: 'x', private_key: 'y' },
      firestore: makeFakeFirestore(),
    });
    assert.deepEqual(await g.readTab('Workers'), []);
  });

  it('writeHeaderRow + appendRow + readTab preserves order; updateRow overwrites by 1-based row', async () => {
    const g = createFirestoreGateway({
      projectId: 'p',
      credentials: { client_email: 'x', private_key: 'y' },
      firestore: makeFakeFirestore(),
    });
    await g.writeHeaderRow('Workers', ['phone', 'name']);
    await g.appendRow('Workers', ['p1', 'Ann']);
    await g.appendRow('Workers', ['p2', 'Bob']);
    assert.deepEqual(await g.readTab('Workers'), [
      ['phone', 'name'],
      ['p1', 'Ann'],
      ['p2', 'Bob'],
    ]);
    await g.updateRow('Workers', 2, ['p1', 'Annie']);
    assert.deepEqual((await g.readTab('Workers'))[1], ['p1', 'Annie']);
  });

  it('concurrent appends do not collide on _row', async () => {
    const g = createFirestoreGateway({
      projectId: 'p',
      credentials: { client_email: 'x', private_key: 'y' },
      firestore: makeFakeFirestore(),
    });
    await g.writeHeaderRow('X', ['h']);
    await Promise.all([g.appendRow('X', ['a']), g.appendRow('X', ['b']), g.appendRow('X', ['c'])]);
    assert.equal((await g.readTab('X')).length, 4);
  });
});
