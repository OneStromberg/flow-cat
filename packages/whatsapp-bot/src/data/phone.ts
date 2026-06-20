export function normalizePhone(s: string): string {
  let digits = (s ?? '').replace(/\D+/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits;
}
