export interface SheetsGateway {
  /** Returns all rows of a tab; row 0 is the header row. */
  readTab(tab: string): Promise<string[][]>;
  /** Overwrites row 1 (the header row) of a tab. */
  writeHeaderRow(tab: string, headers: string[]): Promise<void>;
  /** Appends a single row to the bottom of a tab. */
  appendRow(tab: string, row: string[]): Promise<void>;
  /** Overwrites the given 1-based row number (row 1 = header) with `row`. */
  updateRow(tab: string, rowNumber: number, row: string[]): Promise<void>;
}
