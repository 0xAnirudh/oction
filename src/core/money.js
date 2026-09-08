// Money is integer cents, everywhere, always. A float never touches a
// price: a bid that arrives as 40.15 and leaves as 40.149999999999999
// is a bid that loses an auction it should have won.

export function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const n = Math.abs(cents);
  const whole = Math.floor(n / 100).toLocaleString('en-US');
  return `${sign}$${whole}.${String(n % 100).padStart(2, '0')}`;
}

// Accepts "1,234.50", "$1234", "1234.5", or a number. Returns cents, or
// null if the input is not a plain amount of money.
export function parseAmount(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    return Math.round(input * 100);
  }
  const cleaned = String(input)
    .trim()
    .replace(/[$,\s]/g, '');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}
