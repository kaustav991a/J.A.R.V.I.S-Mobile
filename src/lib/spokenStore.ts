import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What he last said unprompted, and on which day.
 *
 * Two facts, and each holds back a different failure. The **day** enforces at most
 * one remark a day: a machine that speaks unprompted is one bad week away from being
 * muted, and a muted assistant cannot say the one thing that mattered. The
 * **subject** stops the same observation arriving on consecutive days, which is how a
 * remark becomes a nag — one a day is not sufficient on its own.
 *
 * On disk rather than in memory for the obvious reason: the limit is per day, and the
 * app is opened many times a day. A counter that resets on launch is not a limit.
 *
 * The gateway keeps the same pair for its own nudge (`app_nudge.json`). Deliberately
 * not shared: that one speaks by push and this one speaks when the app is opened, and
 * a shared marker would have either silencing the other for reasons the user cannot
 * see. Two channels, two budgets. If they ever both fire in a day that is a real
 * problem, and the fix is a shared marker on the gateway rather than guessing here.
 */
const KEY = 'jarvis_spoken';

export type Spoken = { day: string; about: string };

export async function loadSpoken(): Promise<Spoken | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const o = parsed as Record<string, unknown>;
    // both or neither: a half-written marker must not read as "spoken today about
    // undefined", which would silence him permanently on a subject that has no name
    return typeof o.day === 'string' && typeof o.about === 'string' ? { day: o.day, about: o.about } : null;
  } catch {
    // unreadable means unknown, and unknown must resolve toward speaking rather than
    // toward silence — a lost marker that muted him for good would be
    // indistinguishable from the feature not existing
    return null;
  }
}

export async function saveSpoken(spoken: Spoken): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(spoken));
  } catch {
    // an unwritable marker means he may speak twice today. That is the failure to
    // prefer over the alternative, for the reason above
  }
}
