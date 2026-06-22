export const TRANSPORTATION = [
  { value: 'nothing', label: 'Nothing' },
  { value: 'car', label: 'Car' },
  { value: 'electric_bicycle', label: 'Electric bicycle' },
] as const;

export const HEBREW_LEVEL = [
  { value: 'read_write', label: 'Read & write' },
  { value: 'speaks_good', label: 'Speaks good' },
  { value: 'mid', label: 'Mid speaking level' },
  { value: 'badly', label: 'Speaks badly' },
  { value: 'none', label: "Doesn't know Hebrew" },
] as const;

export const PAY_TYPE = [
  { value: 'full', label: 'Full salary' },
  { value: 'amount', label: 'Specific amount' },
  { value: 'none', label: "Can't receive money" },
] as const;

export const SCHEDULE = [
  { value: 'days', label: 'Days' },
  { value: 'nights', label: 'Nights' },
  { value: 'all', label: 'All' },
] as const;
