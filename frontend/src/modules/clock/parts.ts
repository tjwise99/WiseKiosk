/**
 * Reads the named part out of a `formatToParts()` result, or an empty string if it carries none.
 * Neither caller's fallback is reachable from a real result: 'second' is always present once
 * requested, and 'dayPeriod' is always present in twelve-hour form — the one form that reads it at
 * all. Kept for a locale or engine whose Intl implementation omits either
 * (`parts.test.ts` drives it directly, since no real `formatToParts()` output can).
 */
export function partValue(
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((part) => part.type === type)?.value ?? '';
}
