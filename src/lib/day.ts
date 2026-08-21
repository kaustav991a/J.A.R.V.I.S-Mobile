/**
 * Calendar-day grouping and the name to put over each group.
 *
 * Lifted out of `ChatScreen` when the Activity panel needed the same rules. Two
 * copies would have drifted, and the two surfaces disagreeing about which day a
 * 00:30 entry belongs to is the kind of difference nobody reports and everybody
 * notices.
 */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** which calendar day an entry belongs to, for grouping */
export const dayOf = (at: number): string => {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * The heading over a day's entries.
 *
 * Every line used to carry its own date once the log outlived the app, which put
 * `12 Aug, 14:32` on twenty consecutive lines from the same afternoon. A date is
 * information the first time a day changes and noise every time after, so it
 * moved to a rule between the days and the lines went back to a bare time.
 *
 * Named while a name is more use than a number: yesterday and last Tuesday are how
 * people hold recent days, and a date is only easier once the day has stopped being
 * recent.
 */
export function dayHeading(at: number, now: Date = new Date()): string {
  const d = new Date(at);
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysBack = Math.round((midnight(now) - midnight(d)) / 86_400_000);
  if (daysBack <= 0) return 'Today';
  if (daysBack === 1) return 'Yesterday';
  // inside a week the weekday alone places it; beyond that it stops being useful,
  // because "Tuesday" could be any Tuesday
  if (daysBack < 7) return WEEKDAYS[d.getDay()];
  const stamp = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  // the year only when it is not this one — it is almost never the useful part
  return d.getFullYear() === now.getFullYear() ? stamp : `${stamp} ${d.getFullYear()}`;
}

/** the clock on a single entry: the day is on the rule above it, not on every line */
export const clockLabel = (at: number): string => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
