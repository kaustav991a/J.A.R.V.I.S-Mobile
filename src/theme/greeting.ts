/**
 * The greeting Home opens with, taken from the device clock.
 *
 * The bands are the conventional English ones; "night" runs across midnight,
 * which is why it is the fall-through rather than a range.
 */
export function greetingFor(date: Date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning,';
  if (h >= 12 && h < 17) return 'Good afternoon,';
  if (h >= 17 && h < 21) return 'Good evening,';
  return 'Good night,';
}

/** milliseconds until the next minute ticks over, so the greeting never lags */
export function msToNextMinute(date: Date = new Date()): number {
  return 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds());
}
