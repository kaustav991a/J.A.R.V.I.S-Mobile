import { appLabel } from './digest';
import { dayKey } from './source';
import type { AskUsage } from '../ask';
import type { DailyAppTotal, Journal } from './store';

/**
 * The journal, reduced to the few numbers anything above it actually wants.
 *
 * This is the read side of the recall layer: the screen shows it, the ask
 * envelope carries a trimmed version of it, and the facts sent to the gateway
 * are derived from it. One shape, computed once, so those three can never
 * disagree with each other about the same day.
 */

export type AppSpan = DailyAppTotal;

export type Rollup = {
  /** which local day `today` refers to */
  day: string;
  /** how many days of daily data this was built from, today included */
  days: number;
  today: { ms: number; pickups: number; top: AppSpan[] };
  /**
   * The days BEFORE today, averaged.
   *
   * Today is deliberately excluded. It is a partial day, and averaging it in
   * would drag the baseline down all morning and make every comparison read
   * "lighter than usual" until the evening — an assistant confidently wrong
   * about you before lunch every single day.
   */
  usual: { days: number; avgMs: number; avgPickups: number; top: AppSpan[] };
  /** today minus the usual daily average, in ms. Positive means heavier */
  vsUsual: number;
};

/** how many apps any one list names */
const TOP_N = 3;

/** the window the rollup looks back over, matching what Android retains */
export const WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** local midnight at the start of the day `at` falls in */
export const startOfDay = (at: number): number => {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Build the rollup, or null when there is nothing to build one from.
 *
 * Null rather than a zeroed shape: "he spent no time on his phone this week" and
 * "the journal has not collected anything yet" are different claims, and the
 * second one must never be able to masquerade as the first.
 */
export async function rollup(j: Journal, now: number): Promise<Rollup | null> {
  const day = dayKey(now);
  const from = dayKey(now - (WINDOW_DAYS - 1) * DAY_MS);

  const perDay = await j.msByDay(from, day);
  if (perDay.length === 0) return null;

  const before = perDay.filter((d) => d.day !== day);
  const todayMs = perDay.find((d) => d.day === day)?.ms ?? 0;

  const midnight = startOfDay(now);
  const todayPickups = (await j.timesOfKind('unlock', midnight, now)).length;
  // the whole window's unlocks, minus today's, over the completed days
  const windowPickups = (await j.timesOfKind('unlock', now - WINDOW_DAYS * DAY_MS, now)).length;
  const earlierPickups = Math.max(0, windowPickups - todayPickups);

  const usualDays = before.length;
  const avgMs = usualDays ? Math.round(before.reduce((s, d) => s + d.ms, 0) / usualDays) : 0;
  const avgPickups = usualDays ? Math.round(earlierPickups / usualDays) : 0;

  const todayTop = (await j.dailyFor(day)).slice(0, TOP_N).map((r) => ({ app: r.app, ms: r.ms }));
  const usualTop = usualDays ? await j.appTotals(from, before[before.length - 1].day, TOP_N) : [];

  return {
    day,
    days: perDay.length,
    today: { ms: todayMs, pickups: todayPickups, top: todayTop },
    usual: { days: usualDays, avgMs, avgPickups, top: usualTop },
    // zero rather than a comparison against nothing: on the first day there is
    // no "usual" to be heavier or lighter than, and saying there is would be
    // inventing a baseline out of a single sample
    vsUsual: usualDays ? todayMs - avgMs : 0,
  };
}

/**
 * The rollup, trimmed to what rides on every question.
 *
 * Minutes rather than milliseconds, and real app names rather than package
 * strings: this is read by a language model, and `7942903` and
 * `com.google.android.gm` are both things it would have to decode before it
 * could say anything useful about them.
 */
export async function usageForAsk(j: Journal, now: number): Promise<AskUsage | null> {
  const r = await rollup(j, now);
  if (!r) return null;
  const names = await j.allLabels();
  const minutes = (ms: number) => Math.round(ms / 60_000);
  return {
    today: minutes(r.today.ms),
    pickups: r.today.pickups,
    top: r.today.top.map((t) => appLabel(t.app, names)),
    // null, not zero, when there is no completed day behind it — a zero baseline
    // invites "far more than usual" about someone nobody has watched yet
    usual: r.usual.days ? minutes(r.usual.avgMs) : null,
    // the same for pickups, which `rollup` has always computed and this has always
    // dropped. Null for the same reason: no baseline is not a baseline of zero
    usualPickups: r.usual.days ? r.usual.avgPickups : null,
    days: r.usual.days,
  };
}

/** an app has to be worth this many minutes today before it is worth naming */
export const APP_FLOOR_MIN = 45;

/** and this much more than its own usual */
export const APP_OVER = 2;

export type AppDelta = {
  /** the real name where the journal knows one, the package where it does not */
  app: string;
  /** minutes today */
  today: number;
  /** minutes on an ordinary day, today excluded */
  usual: number;
  /** how many completed days that usual is built from */
  days: number;
};

/**
 * Every app that is well past its OWN usual today, heaviest movement first.
 *
 * A day's total is a fact nobody can act on — "4h on the phone" names nothing that
 * could be different tomorrow. The app that moved is the fact underneath it, and the
 * journal has held per-app days all along: `usageForAsk` reports today's heaviest
 * with no baseline beside them, which is a list rather than a comparison.
 *
 * A floor as well as a ratio, for the same reason the day-level trigger has one: an
 * app that went from two minutes to twelve has tripled, and saying so is arithmetic
 * dressed as an observation. Sorted by how far past its usual it went rather than by
 * size, so the browser that is heavy every day never crowds out the thing that
 * actually changed.
 *
 * Empty rather than null when there is no baseline: an empty list of findings is a
 * true statement about a day, where a zero baseline invites "far more than usual"
 * about somebody nobody has watched yet.
 */
/**
 * The home screen and the system shell, which are not apps anybody chose to open.
 *
 * *"53m in System launcher today against a usual 2m, sir."* — true, and worth nobody's
 * day. The launcher is what is on screen between the things you actually opened, so it
 * accumulates whenever a phone sits unlocked; on 2026-09-02 that was a laptop driving
 * it over adb with stay-awake pinned on. Foreground time there is not a decision about
 * an app, and the day's one remark cannot be spent on it.
 *
 * Matched by shape as well as by name, because the launcher package differs on every
 * phone — `com.miui.home` here, `nexuslauncher` on a Pixel, `sec.android.app.launcher`
 * on a Samsung — and a list of exact strings would quietly stop working on the next
 * device this app is installed on.
 */
const SHELL = /(^|.)(launcherd*|home|systemui|nexuslauncher|trebuchet)$|launcher3?$|systemui/i;

export const isShell = (pkg: string): boolean => SHELL.test(pkg);

export async function appDeltas(j: Journal, now: number): Promise<AppDelta[]> {
  const day = dayKey(now);
  const from = dayKey(now - (WINDOW_DAYS - 1) * DAY_MS);

  const perDay = await j.msByDay(from, day);
  const before = perDay.filter((d) => d.day !== day);
  if (before.length === 0) return [];

  const lastBefore = before[before.length - 1].day;
  const earlier = await j.appTotals(from, lastBefore, 50);
  const usualByApp = new Map(earlier.map((r) => [r.app, Math.round(r.ms / before.length)]));
  const names = await j.allLabels();

  const minutes = (ms: number) => Math.round(ms / 60_000);
  const out: AppDelta[] = [];

  for (const row of await j.dailyFor(day)) {
    if (isShell(row.app)) continue;
    const todayMin = minutes(row.ms);
    const usualMin = minutes(usualByApp.get(row.app) ?? 0);
    if (todayMin < APP_FLOOR_MIN) continue;
    if (todayMin < usualMin * APP_OVER) continue;
    out.push({ app: appLabel(row.app, names), today: todayMin, usual: usualMin, days: before.length });
  }

  // by movement, not by size: the app that changed is the finding
  return out.sort((a, b) => b.today - b.usual - (a.today - a.usual));
}
