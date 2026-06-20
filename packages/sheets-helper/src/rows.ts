export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => (h ?? '').toString().trim());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) o[h] = (r[i] ?? '').toString();
    });
    return o;
  });
}

export function objectToRow(obj: Record<string, string>, headers: string[]): string[] {
  return headers.map((h) => obj[h] ?? '');
}
