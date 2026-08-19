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
 * `known` is what Android's `PackageManager` actually calls each package, kept
 * in the journal. This was originally the last-segment guess alone, on the
 * reasoning that a native call was "a cosmetic gain" — the first real digest off
 * the phone read **"Gm 2h 12m, Pesam 1h 25m, Katana 26m"** and settled it. Those
 * are Gmail, eFootball and Facebook, whose Android package has been
 * `com.facebook.katana` since long before anyone reading this cared. The figures
 * were right and the line was unreadable.
 *
 * The guess stays as the fallback, for a package that has since been
 * uninstalled and was never named while it was there.
 */
export function appLabel(pkg: string, known: Record<string, string> = {}): string {
  const real = known[pkg];
  if (real && real !== pkg) return real;
  const parts = pkg.split('.').filter((p) => p && p !== 'android');
  const last = parts[parts.length - 1] ?? pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/**
 * The voice rules from `commute.ts` apply here too: the figure first, the
 * remark after it, `sir` at most once, and no exclamation marks anywhere.
 */
export function say(reading: Reading, known: Record<string, string> = {}): string {
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
      const named = reading.top.map((t) => `${appLabel(t.app, known)} ${duration(t.ms)}`).join(', ');
      return `${duration(reading.total)} on the phone, sir, across ${reading.pickups} pickups. ${named}.`;
    }
  }
}
