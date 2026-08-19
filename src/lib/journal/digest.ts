import type { DailyRow, UsageEvent } from './store';

/**
 * What a day looked like, and how to say it out loud.
 *
 * Pure functions over rows: no database, no native, no clock. Everything that
 * decides how this *reads* is testable for free, which matters because the
 * wording is the part a person actually meets — and because the one thing this
 * file must never do is confuse "nothing happened" with "nothing was measured".
 */

export type Reading =
  | { state: 'measured'; total: number; top: DailyRow[]; pickups: number }
  /** measured, and there was genuinely nothing */
  | { state: 'empty' }
  /** NOT measured: the permission is absent, or was revoked from Settings */
  | { state: 'denied' }
  | { state: 'error'; problem: string };

/** how many apps a digest names before it stops being a digest */
const TOP_N = 3;

export function summarise(rows: DailyRow[], events: UsageEvent[]): Reading {
  if (rows.length === 0) return { state: 'empty' };
  return {
    state: 'measured',
    // the total counts everything, including what is not named below
    total: rows.reduce((sum, r) => sum + r.ms, 0),
    top: [...rows].sort((a, b) => b.ms - a.ms).slice(0, TOP_N),
    /**
     * Unlocks, not foreground events.
     *
     * An app arriving in the foreground while the phone is already in your hand
     * is not a pickup, and counting those inflates the number severalfold — in
     * the direction that sounds impressive, which is the worst way to be wrong
     * about a figure this assistant is eventually going to volunteer unprompted.
     */
    pickups: events.filter((e) => e.kind === 'unlock').length,
  };
}

const duration = (ms: number): string => {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

/**
 * A package name, turned into something a person recognises.
 *
 * The real label lives in `PackageManager` and would cost another native call
 * for a cosmetic gain; the last meaningful segment is right almost always and
 * wrong harmlessly. `com.instagram.android` ends in a platform word, so a
 * trailing `android` is skipped — unless that is all there is, because a label
 * of nothing is worse than a label of "Android".
 */
export function appLabel(pkg: string): string {
  const parts = pkg.split('.').filter((p) => p && p !== 'android');
  const last = parts[parts.length - 1] ?? pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/**
 * The voice rules from `commute.ts` apply here too: the figure first, the
 * remark after it, `sir` at most once, and no exclamation marks anywhere.
 */
export function say(reading: Reading): string {
  switch (reading.state) {
    case 'denied':
      /**
       * Never "you used nothing".
       *
       * Silence here means the permission is gone, and reading that as
       * abstinence is the bug this project has already paid for twice — the
       * briefing that was correctly mute and cost an evening to prove it, and
       * the Vitals panel sitting empty against a machine reporting fine.
       */
      return 'I cannot see your usage, sir — the permission is off.';
    case 'error':
      return `I could not read the journal, sir (${reading.problem}).`;
    case 'empty':
      return 'Nothing recorded for that day, sir.';
    case 'measured': {
      const named = reading.top.map((t) => `${appLabel(t.app)} ${duration(t.ms)}`).join(', ');
      return `${duration(reading.total)} on the phone, sir, across ${reading.pickups} pickups. ${named}.`;
    }
  }
}
