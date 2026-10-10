/** Utilities for converting amounts from a rates map. */

/**
 * `rates` should contain the number of units of each currency equal to one
 * unit of the chosen base currency. For a MYR-based map, rates.MYR is 1.
 */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;

  const fromRate = rates[from];
  const toRate = rates[to];
  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) {
    return null;
  }

  return (amount / fromRate) * toRate;
}
