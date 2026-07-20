export interface SheetsGateway {
  /** Returns all rows of a tab; row 0 is the header row. */
  readTab(tab: string): Promise<string[][]>;
  /** Overwrites row 1 (the header row) of a tab. */
  writeHeaderRow(tab: string, headers: string[]): Promise<void>;
  /** Appends a single row to the bottom of a tab. */
  appendRow(tab: string, row: string[]): Promise<void>;
  /** Overwrites the given 1-based row number (row 1 = header) with `row`. */
  updateRow(tab: string, rowNumber: number, row: string[]): Promise<void>;
  /**
   * Atomically claims `key` for race-free dedup. Returns `true` (and records
   * the claim at `nowMs`) if there was no prior claim on `key`, or the prior
   * claim is older than `ttlMs` (re-claimable). Returns `false` if a claim
   * already exists within the window. `nowMs` defaults to `Date.now()`.
   * Exactly one of N concurrent callers for the same key/window gets `true`.
   */
  tryClaim(key: string, ttlMs: number, nowMs?: number): Promise<boolean>;
}
