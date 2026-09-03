/**
 * Who you have lost touch with, derived from the call log.
 *
 * Asked for in one sentence on 2026-09-03 — *notice who I have lost touch with* — and
 * chosen over `call:mom` rules, which need a rule engine that lives on a gateway
 * nobody is allowed to touch this week.
 *
 * **No phone number ever reaches this file.** The native side hands over a stable id
 * and the name Android had already cached against the call, so an unknown caller stays
 * an unknown caller and is never named. Nothing here can print a number because
 * nothing here is ever given one.
 */

const DAY = 24 * 60 * 60 * 1000;

/** the fewest calls that can make a gap into a habit — three gaps, four calls */
export const ENOUGH_CALLS = 4;

/** how far past somebody's own usual gap before the silence is worth a sentence */
export const OVERDUE = 2;

/** one missed call is a fact of life; a second from the same caller is a finding */
export const MISSED_FLOOR = 2;

export type Call = {
  /** what Android had cached against the call, or null for a number it did not know */
  name: string | null;
  /** a stable id for the caller, which is not the number and cannot become one */
  who: string;
  at: number;
  kind: 'in' | 'out' | 'missed';
  seconds: number;
};

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : sorted[mid - 1];
};

const spoken = (calls: Call[], who: string): number[] =>
  calls
    .filter((c) => c.who === who && c.kind !== 'missed')
    .map((c) => c.at)
    .sort((a, b) => a - b);

/**
 * How many days usually pass between speaking to somebody.
 *
 * A median rather than a mean, and for the usual reason: one holiday, one week abroad,
 * one fortnight of illness would drag an average out of all recognition, and the
 * figure has to survive the exception to be worth quoting.
 *
 * Missed calls are not conversations and are left out. A phone ringing unanswered is
 * the opposite of having spoken.
 */
export function usualGapDays(calls: Call[], who: string): number | null {
  const times = spoken(calls, who);
  if (times.length < ENOUGH_CALLS) return null;

  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) gaps.push((times[i] - times[i - 1]) / DAY);
  return Math.round(median(gaps));
}

export type LostTouch = { name: string; days: number; usual: number };

/**
 * The person whose silence is furthest past their own usual, or nobody.
 *
 * **Against their own pattern, never against each other.** Somebody spoken to every
 * ten days is not neglected on day nine, and somebody spoken to daily is missed by
 * Wednesday — a single threshold across a whole address book would say both wrong.
 *
 * Named people only. An unknown number that has stopped calling is not somebody you
 * have lost touch with, and this app does not gossip about numbers.
 */
export function lostTouch(calls: Call[], now: Date): LostTouch | null {
  const named = new Map<string, string>();
  for (const c of calls) if (c.name) named.set(c.who, c.name);

  let worst: (LostTouch & { over: number }) | null = null;

  for (const [who, name] of named) {
    const usual = usualGapDays(calls, who);
    if (usual === null || usual <= 0) continue;

    const times = spoken(calls, who);
    const last = times[times.length - 1];
    const days = Math.floor((now.getTime() - last) / DAY);
    const over = days / usual;
    if (over < OVERDUE) continue;

    if (!worst || over > worst.over) worst = { name, days, usual, over };
  }

  return worst ? { name: worst.name, days: worst.days, usual: worst.usual } : null;
}

const sameDay = (a: number, b: number): boolean => {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
  );
};

/**
 * Somebody who tried more than once today and did not get you.
 *
 * The count is what makes this worth saying: one missed call is a fact of life, and
 * three from the same caller in a morning is somebody trying to reach you.
 */
export function missedToday(
  calls: Call[],
  now: Date
): { name: string | null; count: number } | null {
  const today = calls.filter((c) => c.kind === 'missed' && sameDay(c.at, now.getTime()));
  if (!today.length) return null;

  const byCaller = new Map<string, Call[]>();
  for (const c of today) byCaller.set(c.who, [...(byCaller.get(c.who) ?? []), c]);

  let most: Call[] = [];
  for (const group of byCaller.values()) if (group.length > most.length) most = group;

  if (most.length < MISSED_FLOOR) return null;
  return { name: most.find((c) => c.name)?.name ?? null, count: most.length };
}
