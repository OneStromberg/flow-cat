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
  runTransaction(fn: (tx: TxContext) => Promise<void>): Promise<void>;
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
  };
}
