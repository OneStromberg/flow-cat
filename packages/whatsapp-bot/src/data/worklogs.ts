import { objectToRow, rowsToObjects, type SheetsGateway } from '@scourage/sheets-helper';

export async function appendWorkLog(
  gateway: SheetsGateway,
  record: Record<string, string>,
  questionKeys: string[],
): Promise<void> {
  const desired = ['logged_at', 'phone', 'name', ...questionKeys];
  if (record.hours !== undefined && record.hours !== '') desired.push('hours');

  const rows = await gateway.readTab('WorkLogs');
  const existing = rows[0] && rows[0].length ? rows[0].map((h) => h.trim()) : [];

  // Start from existing header; append any desired columns not present yet.
  const header = [...existing];
  for (const col of desired) {
    if (!header.includes(col)) header.push(col);
  }

  if (existing.length === 0 || header.length !== existing.length) {
    await gateway.writeHeaderRow('WorkLogs', header);
  }

  await gateway.appendRow('WorkLogs', objectToRow(record, header));
}

// re-export for callers that want to read back (kept minimal; unused by bot today)
export { rowsToObjects };
