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

/**
 * Twelve weeks.
 *
 * Was four, which segmented weekends correctly and could never learn one: 28 days is
 * at most four Saturdays, and the rules wanted four, so a weekend routine needed a
 * flawless month and never formed. A changed job still fades, because the routine
 * reads only the most recent handful of matching days rather than the whole store.
 */
export const SEEN_TTL_MS = 84 * 24 * 60 * 60 * 1000;

/**
 * How many sightings survive.
 *
 * A few a day for four weeks, with room for a heavy day. Well under what AsyncStorage
 * minds, and the whole point of a cap is that this file can never become the reason
 * the app is slow to start.
 */
export const SEEN_KEEP = 1200;

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
 * How many distinct EARLIER days he has been seen at a place.
 *
 * For the Home panel to count down honestly — "3 more days" is progress, where a
 * silent feature is indistinguishable from a broken one. Today is excluded for the
 * same reason `usuallyGoneBy` excludes it: today is the day being judged, not
 * evidence about it.
 */
export function daysSeenAt(seen: Seen[], place: string, now: Date): number {
  const today = dayKey(now.getTime());
  const days = new Set<string>();
  for (const s of seen) {
    if (s.place !== place) continue;
    const key = dayKey(s.at);
    if (key !== today) days.add(key);
  }
  return days.size;
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

/**
 * The minute of the day you are usually FIRST seen at a place, or null.
 *
 * The mirror of `usuallyGoneBy`, and biased the other way by the same mechanism: a
 * sighting needs the app to be open, so a first sighting is at best when you arrived
 * and at worst an hour after it. Median across days, today excluded, and the same
 * four-day floor — an arrival estimate that has watched three mornings is a guess
 * wearing a figure.
 */
export function usuallyHereBy(seen: Seen[], place: string, now: Date): number | null {
  const today = dayKey(now.getTime());
  const sorted = [...seen].sort((a, b) => a.at - b.at);
  const arrivals = new Map<string, number>();

  for (let i = 0; i < sorted.length; i += 1) {
    const s = sorted[i];
    if (s.place !== place) continue;
    const key = dayKey(s.at);
    if (key === today || arrivals.has(key)) continue;
    // an arrival is a stay that began somewhere else. Without this the median is of
    // first-app-opens, which for the place you wake up in is not an arrival at all —
    // and it produced "usually you are there by 10:49 AM" about somebody's own home
    const before = sorted[i - 1];
    if (!before || before.place === place) continue;
    arrivals.set(key, minuteOfDay(s.at));
  }

  if (arrivals.size < ENOUGH_PLACE_DAYS) return null;
  const times = [...arrivals.values()].sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  // the lower of the two middles on an even count, matching `usuallyGoneBy`
  return times.length % 2 ? times[mid] : times[mid - 1];
}

/** how far before the usual arrival before being early is worth a remark */
export const EARLY_BY_MIN = 45;

/**
 * Being somewhere well before you usually are, with the figure behind it.
 *
 * Only early. Arriving late is deliberately not remarked on: the same margin that
 * makes "an hour early" interesting makes "an hour late" an accusation, and the
 * measurement is not good enough to carry one — a late first sighting is as likely to
 * mean you did not open the app as that you were not there.
 */
export function hereEarly(
  seen: Seen[],
  place: string,
  now: Date
): { usualBy: number; at: number } | null {
  const usualBy = usuallyHereBy(seen, place, now);
  if (usualBy === null) return null;

  /**
   * You have to have arrived, and it is the ARRIVAL that is early — not the clock.
   *
   * Without this the remark fires on a stay that began yesterday: on 2026-09-01 it
   * told somebody who had been at home all night that he was at Home early. The visit
   * he was in had started the previous evening, and nothing about that morning was an
   * arrival at all.
   */
  const visit = visitNow(seen, now);
  if (!visit || visit.place !== place || !visit.arrived) return null;
  // the same day, too: a stay that began yesterday is not today's arrival
  if (dayKey(visit.since) !== dayKey(now.getTime())) return null;

  const at = minuteOfDay(visit.since);
  return at <= usualBy - EARLY_BY_MIN ? { usualBy, at } : null;
}

/** how far past the usual arrival before absence is worth a remark */
export const ABSENT_BY_MIN = 60;

/**
 * Not being somewhere you are usually at by now, judged against THIS weekday only.
 *
 * The weekday rule is not caution, it is a bug this project has already paid for: the
 * gateway's nudge matched a Mon–Fri pattern with a substring and announced a Saturday
 * shift that did not exist. "You are not at the office" on a Sunday is the same
 * mistake wearing different words, and the same fix applies — compare a Friday only
 * with other Fridays, and stay silent until four of them have been seen.
 *
 * Silent, too, the moment you have been seen there today: the question is whether you
 * are missing, not whether you are standing still.
 */
export function absentFrom(
  seen: Seen[],
  place: string,
  now: Date
): { usualBy: number; days: number } | null {
  const today = dayKey(now.getTime());
  const weekday = now.getDay();
  const firstPerDay = new Map<string, number>();

  for (const s of seen) {
    if (s.place !== place) continue;
    const when = new Date(s.at);
    const key = dayKey(s.at);
    // seen there today: nothing is missing
    if (key === today) return null;
    if (when.getDay() !== weekday) continue;
    const minute = minuteOfDay(s.at);
    const held = firstPerDay.get(key);
    if (held === undefined || minute < held) firstPerDay.set(key, minute);
  }

  if (firstPerDay.size < ENOUGH_PLACE_DAYS) return null;
  const sorted = [...firstPerDay.values()].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const usualBy = sorted.length % 2 ? sorted[mid] : sorted[mid - 1];

  return minuteOfDay(now.getTime()) > usualBy + ABSENT_BY_MIN
    ? { usualBy, days: firstPerDay.size }
    : null;
}

/** every place this store has ever seen him at, each named once */
export function placesSeen(seen: Seen[]): string[] {
  return [...new Set(seen.map((s) => s.place))];
}

/**
 * Where you usually are at this hour, and what today is doing instead.
 *
 * **Added 2026-09-01, replacing an arrival model that produced a wrong remark on its
 * first outing.** It said *"At Home early, sir — usually you are there by 10:49 AM"*
 * to somebody who had been home all night and was leaving for the office. Two faults,
 * and the smaller one was the wording: nothing had arrived, and 10:49 was never an
 * arrival time. A sighting is written whenever the app resolves a named place, so the
 * first sighting of a day is the first time the app was OPENED there — which, for the
 * place you wake up in, has nothing to do with arriving.
 *
 * So this leans on what the data can actually carry. **Presence and departure are
 * observable** — the app gets opened at home before leaving, so "last seen at Home
 * around 08:10 on a Tuesday" is a real measurement. **Arrival is barely observable**
 * and is treated as the weak signal it is.
 *
 * Everything here is weekday-matched. A Mon–Fri pattern asserted onto a Saturday is
 * what made the gateway announce a shift that did not exist, and this file is where
 * that mistake would be repeated.
 */

export type DayKind = 'weekend' | 'weekday';

export type Routine = {
  place: string;
  /** how many matching days are behind the claim */
  days: number;
  /** whether those days are this exact weekday, or merely the same kind of day */
  basis: 'weekday' | 'kind';
  kind: DayKind;
};

/** how many of the most recent matching days a routine is read from, so it can change */
export const ROUTINE_RECENT_DAYS = 6;

/** how many of the same weekday before a routine is a routine rather than a coincidence */
export const ROUTINE_DAYS = 3;

/** how wide a window counts as "around now" when asking where you usually are */
export const ROUTINE_WINDOW_MIN = 60;

/** how much earlier than usual a departure has to be before it is worth saying */
export const LEFT_EARLY_MIN = 30;

export type Visit = {
  place: string;
  /** when this stay began — the start of the unbroken run of sightings here */
  since: number;
  /** whether it began by coming from somewhere else, rather than being the first thing ever seen */
  arrived: boolean;
};

/**
 * The stay you are in the middle of, and whether it began with an arrival.
 *
 * The trailing run of sightings at one place is one visit, however many app-opens it
 * contains and however long it spans: last night at Home and this morning at Home are
 * the same stay, which is precisely why "you are here early" must not fire on it.
 */
export function visitNow(seen: Seen[], _now: Date): Visit | null {
  if (!seen.length) return null;
  const sorted = [...seen].sort((a, b) => a.at - b.at);
  const place = sorted[sorted.length - 1].place;
  let i = sorted.length - 1;
  while (i > 0 && sorted[i - 1].place === place) i -= 1;
  // an earlier sighting exists and, by construction, is somewhere else
  return { place, since: sorted[i].at, arrived: i > 0 };
}

/** every day this weekday has been watched, as day key to the sightings on it */
function sameWeekdayDays(seen: Seen[], now: Date): Map<string, Seen[]> {
  const today = dayKey(now.getTime());
  const weekday = now.getDay();
  const days = new Map<string, Seen[]>();
  for (const s of seen) {
    const key = dayKey(s.at);
    if (key === today) continue;
    if (new Date(s.at).getDay() !== weekday) continue;
    const held = days.get(key);
    if (held) held.push(s);
    else days.set(key, [s]);
  }
  return days;
}

/**
 * The place you are usually at around this time on this weekday.
 *
 * Counted in days rather than in sightings, so a morning spent refreshing the app at
 * home does not outvote four Tuesdays. Null whenever it has watched too few of this
 * weekday, or has never watched this hour at all — an hour with no history is not an
 * hour you are usually somewhere else.
 */
export function usualPlaceAt(
  seen: Seen[],
  now: Date,
  windowMin: number = ROUTINE_WINDOW_MIN
): Routine | null {
  const exact = routineFrom(seen, now, windowMin, false);
  if (exact) return exact;
  // a Saturday is more like a Sunday than like a Tuesday: where the weekday itself is
  // still thin, the KIND of day is the next most honest grouping, and saying that
  // beats saying nothing for three months while Saturdays accumulate one a week
  return routineFrom(seen, now, windowMin, true);
}

/** whether a date is a weekend one, which is the coarser grouping a routine falls back to */
export const dayKind = (d: Date): DayKind => (d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : 'weekday');

function routineFrom(seen: Seen[], now: Date, windowMin: number, byKind: boolean): Routine | null {
  const minute = minuteOfDay(now.getTime());
  const today = dayKey(now.getTime());
  const weekday = now.getDay();
  const kind = dayKind(now);
  const daysPerPlace = new Map<string, Map<string, number>>();

  for (const s of seen) {
    const key = dayKey(s.at);
    if (key === today) continue;
    const when = new Date(s.at);
    if (byKind ? dayKind(when) !== kind : when.getDay() !== weekday) continue;
    if (Math.abs(minuteOfDay(s.at) - minute) > windowMin) continue;
    const held = daysPerPlace.get(s.place) ?? new Map<string, number>();
    // the newest sighting of that day, so recency can be judged per day
    held.set(key, Math.max(held.get(key) ?? 0, s.at));
    daysPerPlace.set(s.place, held);
  }

  /**
   * Only the newest days count, and that is what lets a routine change.
   *
   * History is kept for twelve weeks so a weekend can accumulate at all, and a median
   * over twelve weeks would let a job somebody left in July argue with where they are
   * in September. Taking the most recent handful keeps both: enough samples for a
   * Saturday, and a pattern that follows a life rather than outliving it.
   */
  const recent = new Map<string, number>();
  const seenDays = [...new Set([...daysPerPlace.values()].flatMap((m) => [...m.keys()]))];
  const newest = seenDays
    .map((key) => ({ key, at: Math.max(...[...daysPerPlace.values()].map((m) => m.get(key) ?? 0)) }))
    .sort((a, b) => b.at - a.at)
    .slice(0, ROUTINE_RECENT_DAYS)
    .map((d) => d.key);

  for (const [place, days] of daysPerPlace) {
    const count = [...days.keys()].filter((key) => newest.includes(key)).length;
    if (count) recent.set(place, count);
  }

  let best: { place: string; days: number } | null = null;
  for (const [place, days] of recent) {
    if (!best || days > best.days) best = { place, days };
  }
  return best && best.days >= ROUTINE_DAYS
    ? { ...best, basis: byKind ? 'kind' : 'weekday', kind }
    : null;
}

/**
 * Being somewhere your own weekdays say you are not.
 *
 * Names where you usually are rather than merely observing that you are not there,
 * because "you are not at the office" is an accusation and "you are usually at the
 * office around now" is a measurement.
 */
export function elsewhereNow(
  seen: Seen[],
  place: string | null,
  now: Date
): { usual: string; days: number; basis: Routine['basis']; kind: DayKind } | null {
  if (!place) return null;
  const usual = usualPlaceAt(seen, now);
  if (!usual || usual.place === place) return null;
  return { usual: usual.place, days: usual.days, basis: usual.basis, kind: usual.kind };
}

/**
 * Leaving somewhere earlier than this weekday usually does.
 *
 * The strongest thing this data supports, and the one the routine was described by:
 * *the app knows I am at home till about 8:10 Mon–Fri.* It measures **last seen**, not
 * left — so it fires only once you are demonstrably somewhere else, which is what
 * turns a quiet morning into an observed departure rather than a guess.
 */
export function leftEarly(
  seen: Seen[],
  place: string,
  now: Date,
  currentPlace: string | null
): { place: string; lastSeen: number; usualBy: number; days: number } | null {
  // still standing there: not a departure, whatever the clock says
  if (!currentPlace || currentPlace === place) return null;

  const today = dayKey(now.getTime());
  const todayHere = seen.filter((s) => s.place === place && dayKey(s.at) === today);
  if (!todayHere.length) return null;
  const lastSeen = Math.max(...todayHere.map((s) => minuteOfDay(s.at)));

  const lastPerDay: number[] = [];
  for (const [, rows] of sameWeekdayDays(seen, now)) {
    const here = rows.filter((s) => s.place === place);
    if (here.length) lastPerDay.push(Math.max(...here.map((s) => minuteOfDay(s.at))));
  }
  if (lastPerDay.length < ROUTINE_DAYS) return null;

  const sorted = [...lastPerDay].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // the lower of the two middles on an even count, which errs toward saying nothing
  const usualBy = sorted.length % 2 ? sorted[mid] : sorted[mid - 1];

  return lastSeen <= usualBy - LEFT_EARLY_MIN
    ? { place, lastSeen, usualBy, days: sorted.length }
    : null;
}
