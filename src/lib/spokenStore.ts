import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What he last said unprompted, and on which day — now one day per subject.
 *
 * Two rules, and each holds back a different failure. The **day** enforces at most
 * one remark a day: a machine that speaks unprompted is one bad week away from being
 * muted, and a muted assistant cannot say the one thing that mattered. The
 * **subjects** stop the same observation arriving on consecutive days, which is how
 * a remark becomes a nag.
 *
 * It kept one subject until 2026-08-28, and that single slot was the real ceiling on
 * anticipation: with one remark a day and one remembered subject, a dull observation
 * spends the budget exactly as fast as a sharp one, so more triggers would have made
 * the app *less* likely to say the useful thing. A day per subject is what lets the
 * list grow — the daily cap is untouched, and a subject that spoke goes quiet for a
 * few days while a different one may still speak tomorrow.
 *
 * **The old two-field marker still reads.** A phone upgrading at noon has already
 * spoken today, and a migration that dropped that would celebrate the upgrade by
 * saying something twice.
 *
 * On disk rather than in memory for the obvious reason: the limit is per day, and the
 * app is opened many times a day. A counter that resets on launch is not a limit.
 *
 * The gateway keeps its own pair for its own nudge (`app_nudge.json`). Deliberately
 * not shared: that one speaks by push and this one speaks when the app is opened, and
 * a shared marker would have either silencing the other for reasons the user cannot
 * see. Two channels, two budgets. If they ever both fire in a day that is a real
 * problem, and the fix is a shared marker on the gateway rather than guessing here.
 */
export const SPOKEN_KEY = 'jarvis_spoken';

export type Spoken = {
  /** the day of the last remark of any subject — this is the one-a-day cap */
  day: string;
  /** the subject of that last remark */
  about: string;
  /** every subject spoken, against the day it was last spoken */
  said: Record<string, string>;
};

/** how many days a subject stays quiet after it has been spoken */
export const COOLDOWN_DAYS = 3;

export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const daysBetween = (from: string, to: Date): number | null => {
  const [y, m, d] = from.split('-').map(Number);
  if (!y || !m || !d) return null;
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((midnight(to) - midnight(new Date(y, m - 1, d))) / 86_400_000);
};

export async function loadSpoken(): Promise<Spoken | null> {
  try {
    const raw = await AsyncStorage.getItem(SPOKEN_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const o = parsed as Record<string, unknown>;
    // both or neither: a half-written marker must not read as "spoken today about
    // undefined", which would silence him permanently on a subject that has no name
    if (typeof o.day !== 'string' || typeof o.about !== 'string') return null;
    const said =
      o.said !== null && typeof o.said === 'object'
        ? (o.said as Record<string, string>)
        : // the shape before 2026-08-28 knew one subject, and it was the last one
          { [o.about]: o.day };
    return { day: o.day, about: o.about, said };
  } catch {
    // unreadable means unknown, and unknown must resolve toward speaking rather than
    // toward silence — a lost marker that muted him for good would be
    // indistinguishable from the feature not existing
    return null;
  }
}

export async function saveSpoken(spoken: Spoken): Promise<void> {
  try {
    await AsyncStorage.setItem(SPOKEN_KEY, JSON.stringify(spoken));
  } catch {
    // an unwritable marker means he may speak twice today. That is the failure to
    // prefer over the alternative, for the reason above
  }
}

/** record a remark: the daily cap moves, and this subject starts its cooldown */
export async function noteSpoken(about: string, day: string): Promise<void> {
  const before = await loadSpoken();
  await saveSpoken({ day, about, said: { ...(before?.said ?? {}), [about]: day } });
}

/**
 * Whether a subject is still inside its cooldown.
 *
 * Pure, so the decision to stay quiet is testable without a disk — the same reason
 * `anticipate()` takes observations rather than fetching them.
 */
export function spokeRecently(
  spoken: Spoken | null,
  about: string,
  now: Date,
  cooldownDays: number = COOLDOWN_DAYS
): boolean {
  const last = spoken?.said?.[about];
  if (!last) return false;
  const days = daysBetween(last, now);
  return days !== null && days < cooldownDays;
}

/**
 * Forget what was said, so a remark can be induced rather than waited for.
 *
 * One remark a day is the whole budget, which makes the anticipation the hardest
 * thing in this app to observe: a wrong remark, or simply an early one, costs a day
 * before the next can be seen. `anticipate-v1` sat `untested` on exactly that — the
 * rebuilt triggers were never broken, they were unobservable on demand.
 *
 * The marker is dropped whole rather than backdated. The cooldowns are per subject,
 * so a half-cleared marker would leave some subjects able to speak and others silent
 * — a state stranger than either of the two it sits between, and one nobody reading
 * the screen could account for.
 */
export async function forgetSpoken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SPOKEN_KEY);
  } catch {
    // nothing to be done, and the budget simply stays spent
  }
}
