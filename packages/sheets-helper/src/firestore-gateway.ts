import { createHash } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import type { SheetsGateway } from './gateway.ts';

// ---------------------------------------------------------------------------
// Loose structural types for the injectable client (test fake / real Firestore)
// ---------------------------------------------------------------------------

interface Snapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

interface DocRef {
  path: string;
  collection(name: string): CollRef;
  set(data: Record<string, unknown>, opts?: { merge?: boolean }): Promise<void>;
  get(): Promise<Snapshot>;
}

interface QueryResult {
  docs: Array<{ data(): Record<string, unknown> }>;
}

interface CollRef {
  doc(id: string): DocRef;
  orderBy(field: string): { get(): Promise<QueryResult> };
}

interface TxContext {
  get(ref: DocRef): Promise<Snapshot>;
  set(ref: DocRef, data: Record<string, unknown>, opts?: { merge?: boolean }): void;
}

interface FirestoreLike {
  collection(name: string): CollRef;
  // Generic to match the real Firestore#runTransaction<T>, which resolves to
  // whatever the update function returns (needed so tryClaim can return its
  // boolean result out of the transaction).
  runTransaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface FirestoreGatewayOptions {
  projectId: string;
  credentials: { client_email: string; private_key: string };
  /** Firestore root collection name (default: "sheets"). */
  rootCollection?: string;
  /** Named Firestore database id. Omit/undefined ⇒ the "(default)" database. */
  databaseId?: string;
  /**
   * Injectable Firestore-like client for testing. When omitted a real
   * `@google-cloud/firestore` Firestore instance is created.
   */
  firestore?: FirestoreLike;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const id = (n: number): string => String(n).padStart(9, '0');

/**
 * Sanitizes an arbitrary claim key into a valid Firestore doc id. Firestore
 * ids can't contain "/" (and have a handful of other restrictions), so we
 * replace disallowed characters and append a short content hash to avoid
 * collisions between two different keys that sanitize to the same string
 * (e.g. "a/b" and "a_b" would otherwise collide).
 */
function safeClaimDocId(key: string): string {
  const sanitized = key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 10);
  return `${sanitized || '_'}__${hash}`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFirestoreGateway(opts: FirestoreGatewayOptions): SheetsGateway {
  const root = opts.rootCollection ?? 'sheets';

  const db: FirestoreLike =
    opts.firestore ??
    (new Firestore({
      projectId: opts.projectId,
      credentials: opts.credentials,
      // A named (non-default) database must be selected explicitly, else the
      // client connects to "(default)". `undefined` ⇒ the default database.
      ...(opts.databaseId ? { databaseId: opts.databaseId } : {}),
    }) as unknown as FirestoreLike);

  function tabRef(tab: string): DocRef {
    return db.collection(root).doc(tab);
  }

  function rowsRef(tab: string): CollRef {
    return db.collection(root).doc(tab).collection('rows');
  }

  function claimRef(key: string): DocRef {
    return db.collection(root).doc('_claims').collection('keys').doc(safeClaimDocId(key));
  }

  return {
    async readTab(tab: string): Promise<string[][]> {
      const snap = await rowsRef(tab).orderBy('_row').get();
      return snap.docs.map((d) => (d.data()._cells ?? []) as string[]);
    },

    async writeHeaderRow(tab: string, headers: string[]): Promise<void> {
      // Atomically write the header doc and update the tab meta-doc count.
      await db.runTransaction(async (tx) => {
        const t = await tx.get(tabRef(tab));
        const c = (t.data()?.count as number | undefined) ?? 0;
        tx.set(rowsRef(tab).doc(id(1)), { _row: 1, _cells: headers });
        tx.set(tabRef(tab), { count: Math.max(c, 1) }, { merge: true });
      });
    },

    async appendRow(tab: string, row: string[]): Promise<void> {
      await db.runTransaction(async (tx) => {
        const t = await tx.get(tabRef(tab));
        const c = (t.data()?.count as number | undefined) ?? 0;
        const n = c + 1;
        tx.set(rowsRef(tab).doc(id(n)), { _row: n, _cells: row });
        tx.set(tabRef(tab), { count: n }, { merge: true });
      });
    },

    async updateRow(tab: string, rowNumber: number, row: string[]): Promise<void> {
      await rowsRef(tab).doc(id(rowNumber)).set({ _row: rowNumber, _cells: row });
    },

    async tryClaim(key: string, ttlMs: number, nowMs?: number): Promise<boolean> {
      const now = nowMs ?? Date.now();
      // Check-and-set happens INSIDE a single transaction, so two concurrent
      // tryClaim calls for the same key are serialized by Firestore and
      // exactly one observes "no prior claim" / "expired claim" → true.
      return db.runTransaction(async (tx) => {
        const ref = claimRef(key);
        const snap = await tx.get(ref);
        const last = snap.exists ? (snap.data()?.claimedAtMs as number | undefined) : undefined;
        if (last === undefined || now - last >= ttlMs) {
          tx.set(ref, { claimedAtMs: now });
          return true;
        }
        return false;
      });
    },
  };
}
