export function normalizePhone(s: string): string {
  let digits = (s ?? '').replace(/\D+/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = '972' + digits.slice(1); // Israeli local → international
  return digits;
}

export function toE164(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}
