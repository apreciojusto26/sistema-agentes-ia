/**
 * decimal-string -> integer cents parser. NEVER `parseFloat(amount) * 100` —
 * floating point drift ("19.90" * 100 can produce 1989.9999999998 depending on
 * the value) is unacceptable for money. Split on '.' and pad instead.
 */
export function moneyToCents(amount: string): number {
  const [wholePart = '0', fractionPart = ''] = amount.split('.');
  const cents = (fractionPart + '00').slice(0, 2);
  const whole = wholePart.replace(/[^0-9-]/g, '') || '0';
  return Number(whole) * 100 + Number(cents);
}
