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

export type Seen = {
  place: string;
  at: number;
  /**
   * How the sighting was made, absent on everything written before 2026-09-01.
   *
   * `'exit'` and `'enter'` come from a geofence and mean the boundary was actually
   * crossed, whether or not the app was open. Everything else is an app-open: the
   * phone happened to resolve a place because somebody was using it, which is why
   * every figure derived from those is a bound rather than a time.
   */
  via?: 'enter' | 'exit';
};

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
export async function noteSeen(
  place: string,
  at: number = Date.now(),
  via?: 'enter' | 'exit'
): Promise<void> {
  if (!place) return;
  try {
    const seen = await loadSeen();
    const last = seen[seen.length - 1];
    // a crossing is never a duplicate: two of them 20 minutes apart are a real
    // departure and a real return, which is exactly what the app-open store cannot see
    if (!via && last && last.place === place && at - last.at < SAME_VISIT_MIN * 60_000) return;
    const sighting = via ? { place, at, via } : { place, at };
    await AsyncStorage.setItem(KEY, JSON.stringify([...seen, sighting].slice(-SEEN_KEEP)));
  } catch {
    /* see above */
  }
}

/**
 * Take back the exits that turned out to be a platform sweep, and say whether to drop
 * this one too.
 *
 * Answers true when another place reported leaving inside the window, which is the
 * signature of Play Services re-evaluating every region rather than of a person
 * walking out of somewhere. The earlier sightings from the same burst go with it: they
 * were written before there was anything to tell them apart from a departure.
 *
 * Arrivals are never touched. No sweep produces one — a phone can only be inside the
 * region it is inside — so an `enter` is always the real thing.
 */
export async function dropExitsAround(
  at: number,
  place: string,
  windowMs: number,
  far: (a: string, b: string) => boolean = () => true
): Promise<boolean> {
  try {
    const seen = await loadSeen();
    // only a departure a person could not also have made counts as the platform:
    // overlapping circles are left together on one walk, and both are real
    const burst = seen.filter(
      (s) =>
        s.via === 'exit' &&
        s.place !== place &&
        far(place, s.place) &&
        Math.abs(at - s.at) <= windowMs
    );
    if (!burst.length) return false;

    const kept = seen.filter(
      (s) => !(s.via === 'exit' && Math.abs(at - s.at) <= windowMs && far(place, s.place))
    );
    await AsyncStorage.setItem(KEY, JSON.stringify(kept));
    return true;
  } catch {
    // a store that cannot be read cannot be corrected, and a false departure is
    // better than a lost real one
    return false;
  }
}

/**
 * Take the platform's sweeps back out of the history, once, at launch.
 *
 * `dropExitsAround` catches a burst as it happens; this is for the ones already
 * written. On 2026-09-01 at 18:31 ten places reported leaving in the same minute and
 * all ten were stored before anything knew better, which would have taught him a
 * departure time for every place he owns — from an office he had not left yet.
 *
 * The same signature: two or more places leaving inside the window. A lone exit is a
 * departure and stays. Arrivals and app-open sightings are never touched.
 */
export async function pruneSweepExits(
  windowMs: number = 90_000,
  far: (a: string, b: string) => boolean = () => true
): Promise<number> {
  try {
    const seen = await loadSeen();
    const exits = seen.filter((s) => s.via === 'exit');
    if (!exits.length) return 0;

    const swept = new Set<number>();

    /**
     * You can only leave where you were.
     *
     * A sweep reports every region the phone is OUTSIDE of, so at the office it says
     * you left Home — and when only one place is named there is no burst to recognise.
     * The tell is what came immediately before: a departure from somewhere the app was
     * not just seeing you is the platform describing geometry, not a person walking
     * out of a door.
     *
     * Nothing before it means nothing to judge it by, and it stands. Silence is not
     * evidence, and a real first departure has to be allowed to be the first thing in
     * the history.
     */
    for (const a of exits) {
      const before = seen.filter((b) => b.at < a.at && b.at > a.at - 6 * 3600_000).pop();
      // "somewhere else" has to mean somewhere else: leaving home is also leaving the
      // neighbourhood it overlaps, and the sighting before it is the neighbour
      if (before && before.place !== a.place && far(before.place, a.place)) swept.add(a.at);
    }

    for (const a of exits) {
      const burst = exits.filter(
        (b) => b.place !== a.place && far(a.place, b.place) && Math.abs(a.at - b.at) <= windowMs
      );
      if (burst.length) {
        swept.add(a.at);
        for (const b of burst) swept.add(b.at);
      }
    }
    if (!swept.size) return 0;

    const kept = seen.filter((s) => !(s.via === 'exit' && swept.has(s.at)));
    await AsyncStorage.setItem(KEY, JSON.stringify(kept));
    return seen.length - kept.length;
  } catch {
    // history that cannot be read cannot be repaired, and nothing depends on this
    return 0;
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
 * When you usually leave a place, and whether that is measured or merely bounded.
 *
 * **The whole point of the geofence, expressed in one return value.** With exits, the
 * median is a departure: Android reported the boundary being crossed, app open or
 * not, a couple of minutes late rather than hours. Without them, the best available
 * is the last app-open — which said 3:40 PM about an office he leaves at seven — and
 * `measured: false` is how every caller is told not to word it as a departure.
 *
 * Exits are only trusted once there are as many as any other habit here needs. Two
 * of them is a coincidence with a timestamp.
 */
export function leftBy(
  seen: Seen[],
  place: string,
  now: Date
): { minute: number; measured: boolean } | null {
  const today = dayKey(now.getTime());
  const exits = new Map<string, number>();

  for (const s of seen) {
    if (s.place !== place || s.via !== 'exit') continue;
    const key = dayKey(s.at);
    if (key === today) continue;
    // the last exit of a day: stepping out for lunch is not going home
    const held = exits.get(key);
    const minute = minuteOfDay(s.at);
    if (held === undefined || minute > held) exits.set(key, minute);
  }

  if (exits.size >= ENOUGH_PLACE_DAYS) {
    const times = [...exits.values()].sort((a, b) => a - b);
    const mid = Math.floor(times.length / 2);
    return {
      minute: times.length % 2 ? times[mid] : times[mid - 1],
      measured: true,
    };
  }

  const floor = usuallyGoneBy(seen, place, now);
  return floor === null ? null : { minute: floor, measured: false };
}
/**
 * How many earlier days a departure from a place was actually watched.
 *
 * The panel needs this to tell two silences apart: *nothing has ever seen you leave*
 * and *it has seen you leave once and wants a few more before calling it usual*. On
 * 2026-09-02 the row said the first while the store held Monday's 7:08 PM exit, which
 * reads as a broken feature rather than an honest one counting up.
 *
 * Days, not sightings, and never today — the same rule every baseline here follows.
 */
export function exitDaysAt(seen: Seen[], place: string, now: Date): number {
  const today = dayKey(now.getTime());
  const days = new Set<string>();
  for (const s of seen) {
    if (s.place !== place || s.via !== 'exit') continue;
    const key = dayKey(s.at);
    if (key !== today) days.add(key);
  }
  return days.size;
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
 * Where and when you are usually next seen after a place.
 *
 * The hour alone said "by 8:04 PM you are usually elsewhere", and the answer came
 * back in one sentence: *8:04 is generally in the train at Sealdah*. That is the
 * argument for carrying the place — a figure with a name attached can be confirmed
 * or contradicted immediately, and this one was confirmed immediately.
 *
 * The place is the one seen most often across those days rather than the first ever
 * seen: one detour should not rename a commute.
 */
export function nextSeenElsewhere(
  seen: Seen[],
  place: string,
  now: Date
): { minute: number; place: string } | null {
  const today = dayKey(now.getTime());
  const sorted = [...seen].sort((a, b) => a.at - b.at);
  const lastHere = new Map<string, number>();
  const firstAfter = new Map<string, Seen>();

  for (const s of sorted) {
    const key = dayKey(s.at);
    if (key === today) continue;
    if (s.place === place) {
      lastHere.set(key, s.at);
      // back at the place: whatever came before was not the end of the day here
      firstAfter.delete(key);
      continue;
    }
    const here = lastHere.get(key);
    if (here !== undefined && !firstAfter.has(key)) firstAfter.set(key, s);
  }

  if (firstAfter.size < ENOUGH_PLACE_DAYS) return null;

  const rows = [...firstAfter.values()];

  /**
   * The place first, then the hour of THAT place's evenings.
   *
   * Taken separately they describe a day that never happened: on the phone this read
   * "8:04 PM — usually at Home", where 8:04 was the train at Sealdah and Home is an
   * hour later. The median hour came from every evening and the name from whichever
   * appeared most often, so the pair straddled two different sets of days.
   */
  const tally = new Map<string, number>();
  for (const r of rows) tally.set(r.place, (tally.get(r.place) ?? 0) + 1);
  let best = rows[0].place;
  for (const [name, n] of tally) if (n > (tally.get(best) ?? 0)) best = name;

  const times = rows
    .filter((r) => r.place === best)
    .map((r) => minuteOfDay(r.at))
    .sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const minute = times.length % 2 ? times[mid] : times[mid - 1];

  return { minute, place: best };
}
/**
 * The minute of the day you are usually next seen SOMEWHERE ELSE, or null.
 *
 * **Reported from the phone on 2026-09-01, and it is the honest half of a departure.**
 * The panel had been saying *"When you are usually gone — 3:40 PM"* about an office
 * he leaves at seven. `usuallyGoneBy` is the median of the last sighting at a place,
 * and a sighting needs the app open — so it had measured when he stops checking his
 * phone at work and called it leaving.
 *
 * The app cannot watch a departure. It can see two things that bracket one: the last
 * time he was there, and the first time he was somewhere else. This is the second,
 * and it is the bound worth judging "still here" against — being at the office at
 * 4:25 is nothing, being there when you are normally home is something.
 *
 * **Only days that actually showed him elsewhere afterwards count.** A day with no
 * later sighting is not evidence of a late night; it is evidence of a phone left in
 * a pocket, and counting it would rebuild the same false claim one level up.
 */
export function seenElsewhereBy(seen: Seen[], place: string, now: Date): number | null {
  return nextSeenElsewhere(seen, place, now)?.minute ?? null;
}
/**
 * Whether you are at a place well past the hour you are usually gone from it.
 *
 * `false` whenever it cannot know — no history, not enough days, or not yet past the
 * margin. Silence is the default and needs no excuse.
 */
export function stillHereLate(seen: Seen[], place: string, now: Date): boolean {
  /**
   * Judged against when he is usually somewhere ELSE, not when he was last seen here.
   *
   * The last-seen figure fired this every workday: 3:40 PM plus a 45 minute margin
   * is 4:25, and he leaves at seven. The bound that means anything is the hour he is
   * normally elsewhere — being at the office then is genuinely unusual.
   *
   * No evidence of ever leaving means no claim. A place he is seen at and never seen
   * away from cannot support the word "still".
   */
  const elsewhere = seenElsewhereBy(seen, place, now);
  if (elsewhere === null) return false;
  return minuteOfDay(now.getTime()) > elsewhere + LATE_BY_MIN;
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

/**
 * The hour he arrives at a place, and whether anything watched him do it.
 *
 * Two sources and they disagree by an hour and a half. A geofence `enter` is the
 * boundary being crossed with the phone in a pocket; everything else is the first
 * moment somebody happened to pick the phone up at that place, which is always later
 * than arriving. On 2026-09-02 the app told a man at his desk since 10:03 that he was
 * *"at Office early, sir — usually you are there by 11:51 AM"*: right about its data,
 * and its data had only ever seen him late.
 *
 * **This is the arrival twin of `leftBy`**, and the same rule holds — the measured
 * source wins as soon as it has enough days, and the fallback is reported as a
 * fallback rather than dressed as a figure. What a caller does with `measured: false`
 * is its own decision; `earlyRemark` refuses to speak on one, because "you are early"
 * is a claim about a habit and that is exactly what an app-open median is not.
 */
export function arrivalHour(
  seen: Seen[],
  place: string,
  now: Date
): { minute: number; measured: boolean } | null {
  const today = dayKey(now.getTime());
  const crossings = new Map<string, number>();

  for (const s of seen) {
    if (s.place !== place || s.via !== 'enter') continue;
    const key = dayKey(s.at);
    if (key === today) continue;
    // the FIRST crossing of a day: coming back from lunch is not arriving
    const held = crossings.get(key);
    const minute = minuteOfDay(s.at);
    if (held === undefined || minute < held) crossings.set(key, minute);
  }

  if (crossings.size >= ENOUGH_PLACE_DAYS) {
    const times = [...crossings.values()].sort((a, b) => a - b);
    const mid = Math.floor(times.length / 2);
    return { minute: times.length % 2 ? times[mid] : times[mid - 1], measured: true };
  }

  const guess = usuallyHereBy(seen, place, now);
  return guess === null ? null : { minute: guess, measured: false };
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
  /**
   * The hour has to have been watched, not inferred.
   *
   * "You are early" is a claim about a habit, and an app-open median is not one: it
   * is the hour somebody tends to pick up their phone at a place, which is always
   * after arriving. On 2026-09-02 that produced *"at Office early, sir — usually you
   * are there by 11:51 AM"* to a man at that desk by ten. Nothing was early; the
   * baseline was late.
   *
   * So this stays silent until the crossings have enough days, the same way the
   * departure figure waited. Silence for a few days is the cost of not making the
   * 3:40 PM mistake in the other direction.
   */
  const arrival = arrivalHour(seen, place, now);
  if (!arrival || !arrival.measured) return null;
  const usualBy = arrival.minute;

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
