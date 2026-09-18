// jsonwebtoken accepts '7d' and friends; Date arithmetic does not. This
// converts the handful of shapes the config actually uses rather than
// pulling in a dependency to parse a string we write ourselves.
const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export default function ms(value) {
  if (typeof value === 'number') return value;
  const match = /^(\d+)\s*([smhd])$/.exec(String(value).trim());
  if (!match) return 7 * UNITS.d;
  return Number(match[1]) * UNITS[match[2]];
}
