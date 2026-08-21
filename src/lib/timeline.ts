import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where you have been seen, and when you are usually gone from there.
 *
 * **Why this is the observation worth having.** `anticipate` needs something that is
 * neither a setting you typed nor already printed on the screen — a leaving-time
 * countdown was built on 2026-08-21 and withdrawn the same day for being both. This
 * is the opposite: *"you are still at Office and you are usually gone by about
 * 6:40"* is derived from your own history, is not on any screen, and carries a figure
 * you can disagree with.
 *
 * **Separate from the trail in `place.ts`, deliberately.** That one keeps twelve steps
 * for three days and only records *changes* of place — it exists so a question can
 * carry "where was I this morning". Habit needs weeks of sightings, so it needs its
 * own store rather than a stretched version of one built for something else.
 *
 * **What this measures is LAST SEEN, not left.** Sightings happen when the app is
 * opened and a fix resolves to a named place; nothing watches you in the background,
 * because nothing on this phone can (`ROADMAP.md` §7). So if you never open the app on
 * the way out, the last sighting predates your leaving and the estimate runs early.
 * Three things hold that in check: a median rather than a mean, several days required,
 * and a margin before anything is said. The remark then names the figure so a wrong
 * one is arguable rather than authoritative.
 *
 * Named places only — the label from `knownPlaces`, never a geocoder's guess. A
 * reverse-geocoded string drifted across four turns for the same desk, which is why
 * `nameFor` exists at all.
 */
const KEY = 'jarvis_place_seen';

/** four weeks. Long enough for a habit, short enough that a changed job fades out */
export const SEEN_TTL_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * How many sightings survive.
 *
 * A few a day for four weeks, with room for a heavy day. Well under what AsyncStorage
 * minds, and the whole point of a cap is that this file can never become the reason
 * the app is slow to start.
 */
export const SEEN_KEEP = 400;

/**
 * Two sightings of the same place inside this window count as one.
 *
 * Opening the app four times while waiting for a lift should not write four rows, and
 * more importantly should not make an early evening look like a late one by sheer
 * count — the median is per DAY, so density does not skew it, but the cap is finite
 * and spam would evict real history.
 */
const SAME_VISIT_MIN = 20;

/** how many distinct earlier days before "usually" means anything */
export const ENOUGH_PLACE_DAYS = 4;

/** how far past the usual hour before it is worth remarking on */
export const LATE_BY_MIN = 45;

export type Seen = { place: string; at: number };

const dayKey = (at: number): string => {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const minuteOfDay = (at: number): number => {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes();
};

export async function loadSeen(): Promise<Seen[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - SEEN_TTL_MS;
    return parsed
      .filter(
        (s): s is Seen =>
          s !== null &&
          typeof s === 'object' &&
          typeof (s as Seen).place === 'string' &&
          typeof (s as Seen).at === 'number' &&
          (s as Seen).at > cutoff
      )
      .slice(-SEEN_KEEP);
  } catch {
    // unreadable history is no history, which only costs a remark
    return [];
  }
}

/**
 * Record that you were at a named place, unless the same visit was just recorded.
 *
 * Silent on every failure. A sighting that cannot be written is a sighting that never
 * happened, and nothing above this may fail because of it.
 */
export async function noteSeen(place: string, at: number = Date.now()): Promise<void> {
  if (!place) return;
  try {
    const seen = await loadSeen();
    const last = seen[seen.length - 1];
    if (last && last.place === place && at - last.at < SAME_VISIT_MIN * 60_000) return;
    await AsyncStorage.setItem(KEY, JSON.stringify([...seen, { place, at }].slice(-SEEN_KEEP)));
  } catch {
    /* see above */
  }
}

/** forget the lot — paired with the location-sharing switch going off */
export async function forgetSeen(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* nothing to be done, and nothing depends on it */
  }
}

/**
 * The minute of the day you are usually last seen at a place, or null.
 *
 * Per day the LAST sighting, then the median across days — not the mean. One evening
 * that ran to midnight should move this by nothing, and with a mean it would move it
 * by an hour. **Today is excluded**, because today is the day being judged: including
 * it would let a late evening quietly raise the bar it is being measured against.
 */
export function usuallyGoneBy(seen: Seen[], place: string, now: Date): number | null {
  const today = dayKey(now.getTime());
  const lastPerDay = new Map<string, number>();

  for (const s of seen) {
    if (s.place !== place) continue;
    const key = dayKey(s.at);
    if (key === today) continue;
    const minute = minuteOfDay(s.at);
    const held = lastPerDay.get(key);
    if (held === undefined || minute > held) lastPerDay.set(key, minute);
  }

  if (lastPerDay.size < ENOUGH_PLACE_DAYS) return null;
  const sorted = [...lastPerDay.values()].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // an even count takes the lower of the two middles, which errs toward saying
  // nothing rather than toward accusing someone of being late
  return sorted.length % 2 ? sorted[mid] : sorted[mid - 1];
}

/**
 * Whether you are at a place well past the hour you are usually gone from it.
 *
 * `false` whenever it cannot know — no history, not enough days, or not yet past the
 * margin. Silence is the default and needs no excuse.
 */
export function stillHereLate(seen: Seen[], place: string, now: Date): boolean {
  const gone = usuallyGoneBy(seen, place, now);
  if (gone === null) return false;
  return minuteOfDay(now.getTime()) > gone + LATE_BY_MIN;
}
