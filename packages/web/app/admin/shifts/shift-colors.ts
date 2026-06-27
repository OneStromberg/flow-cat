// ponytail: djb2 hash for ~8 colors — good enough for this many locations
const COLORS = [
  'bg-blue-500 text-white',
  'bg-emerald-500 text-white',
  'bg-rose-500 text-white',
  'bg-amber-500 text-white',
  'bg-violet-500 text-white',
  'bg-cyan-600 text-white',
  'bg-pink-500 text-white',
  'bg-orange-500 text-white',
];

export function colorFor(location: string): string {
  let h = 5381;
  for (let i = 0; i < location.length; i++) h = ((h << 5) + h) ^ location.charCodeAt(i);
  return COLORS[Math.abs(h) % COLORS.length];
}
