import AsyncStorage from '@react-native-async-storage/async-storage';
import { openVoice } from './briefingVoice';
import type { Slot, Voice } from './briefingVoice';

/**
 * The leaving briefing: what the journey looks like, and what to carry.
 *
 * Advice comes from thresholds on real figures, never from the model. "Take an
 * umbrella" has to be true — a hallucinated umbrella is worse than no briefing,
 * because it is the one thing a person acts on without checking.
 *
 * The window is the departure hour and the two after it, not the whole day. A
 * daily maximum says it will rain at some point in the next 24 hours, which is not
 * the question being asked on the way out of the door.
 *
 * A day has more than one door. There is leaving home in the morning and leaving
 * the office at night, they are hours apart, and the weather at one says nothing
 * about the other — so a departure is a list, not a single time.
 */
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

export type Departure = {
  /** the `KnownPlace` being left, so the forecast is for there and not for here */
  placeId: string;
  label: string;
  on: boolean;
  /** 24h local time, and the reason every label in this feature prints a meridiem */
  hour: number;
  minute: number;
};

export type CommuteSettings = {
  departures: Departure[];
  /**
   * Which days it runs, indexed the way `Date.getDay()` counts — 0 is Sunday.
   *
   * A flag per day rather than `weekdaysOnly`, because the exception is real:
   * the weekend is off, but a Saturday is worked often enough to need switching
   * on without also switching on Sunday.
   */
  days: boolean[];
};

/** Mon–Fri. Index 0 is Sunday, matching `Date.getDay()`. */
export const WEEKDAYS_ONLY = [false, true, true, true, true, true, false];

/** initials for the day chips, in `getDay()` order */
export const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DEFAULT_COMMUTE: CommuteSettings = {
  departures: [
    { placeId: 'home', label: 'Home', on: false, hour: 8, minute: 0 },
    { placeId: 'office', label: 'Office', on: false, hour: 19, minute: 0 },
  ],
  days: [...WEEKDAYS_ONLY],
};

const SETTINGS_KEY = 'jarvis_commute';
const LAST_SENT_KEY = 'jarvis_commute_sent';

/** thresholds, in one place so they can be argued with */
export const RAIN_CHANCE = 50;
export const RAIN_MM = 0.4;
export const HOT_C = 35;
export const COLD_C = 12;
export const WINDY_KMH = 40;

export type Briefing = { title: string; body: string };

/**
 * The three answers a forecast lookup can give, which used to be two.
 *
 * `Briefing | null` collapsed "nothing worth saying" and "could not find out" into
 * the same value, and the task read both as the former — then wrote the once-a-day
 * marker. On the test phone the headless task has no network at all
 * (`dumpsys jobscheduler` reports `blocked=REASON_APP_BACKGROUND|REASON_APP_STANDBY`
 * for this uid), so every run failed, marked the departure briefed, and went quiet
 * until tomorrow, where it did the same again.
 *
 * A silence that means "the morning is fine" is correct and must stay. A silence
 * that means "the phone could not reach Open-Meteo" must not consume the day.
 */
export type BriefingOutcome =
  | { state: 'briefing'; briefing: Briefing }
  /**
   * The forecast was read and there is nothing worth carrying anything for — but it
   * still carries a briefing, because since 2026-08-18 a quiet day is announced too.
   * The state is kept separate from `briefing` so the difference stays inspectable:
   * PREVIEW words them differently, and re-muting the quiet case later is then a
   * one-line change rather than an archaeology exercise.
   */
  | { state: 'clear'; briefing: Briefing }
  /** the forecast could not be read, so nothing is known either way */
  | { state: 'unavailable'; reason: 'network' | 'http' | 'no-hours' | 'no-window' };

const hour12 = (h: number): number => (h % 12 === 0 ? 12 : h % 12);
const meridiem = (h: number): string => (h % 24 < 12 ? 'AM' : 'PM');

/**
 * A clock reading nobody can misread.
 *
 * The stepper produced `08:00` for someone who meant eight in the evening, and
 * nothing on the screen or in the notification disagreed until the briefing failed
 * to arrive twelve hours later. 24-hour digits are unambiguous only to a reader
 * already thinking in them; the meridiem is the part that catches the mistake, so
 * it is on every clock this feature prints.
 */
export const clockLabel = (hour: number, minute: number): string =>
  `${hour12(hour)}:${String(minute).padStart(2, '0')} ${meridiem(hour)}`;

/** the same, to the hour — for naming the forecast window */
export const hourLabel = (hour: number): string => `${hour12(hour)} ${meridiem(hour)}`;

const clampHour = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 24 ? v : fallback;

const clampMinute = (v: unknown): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 60 ? v : 0;

/**
 * The shape stored before departures were a list: one time, one `weekdaysOnly`.
 *
 * Read rather than discarded because a stored setting is the user having already
 * told us something, and dropping it on an app update makes the feature look like
 * it forgot. The old single time becomes the departure from home.
 */
type LegacyCommute = { on?: unknown; hour?: unknown; minute?: unknown; weekdaysOnly?: unknown };

function migrate(legacy: LegacyCommute): CommuteSettings {
  const [home, office] = DEFAULT_COMMUTE.departures;
  return {
    departures: [
      { ...home, on: legacy.on === true, hour: clampHour(legacy.hour, home.hour), minute: clampMinute(legacy.minute) },
      { ...office },
    ],
    // `weekdaysOnly: false` meant every day, which is the only other state it had
    days: legacy.weekdaysOnly === false ? [true, true, true, true, true, true, true] : [...WEEKDAYS_ONLY],
  };
}

/**
 * Seven booleans, whatever was on disk.
 *
 * A short or malformed array would otherwise index to `undefined` on the missing
 * days, which is falsy — a briefing silently switched off for Saturday by a
 * storage bug, which is exactly the class of failure this feature keeps having.
 */
const readDays = (v: unknown): boolean[] =>
  Array.isArray(v) && v.length === 7 ? v.map((d) => d === true) : [...WEEKDAYS_ONLY];

const readDeparture = (v: unknown, fallback: Departure): Departure => {
  if (v === null || typeof v !== 'object') return { ...fallback };
  const d = v as Record<string, unknown>;
  return {
    placeId: typeof d.placeId === 'string' && d.placeId ? d.placeId : fallback.placeId,
    label: typeof d.label === 'string' && d.label ? d.label : fallback.label,
    on: d.on === true,
    hour: clampHour(d.hour, fallback.hour),
    minute: clampMinute(d.minute),
  };
};

export async function loadCommute(): Promise<CommuteSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_COMMUTE;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return DEFAULT_COMMUTE;
    const o = parsed as Record<string, unknown>;
    if (!Array.isArray(o.departures)) return migrate(o as LegacyCommute);
    return {
      departures: DEFAULT_COMMUTE.departures.map((fallback) => {
        const stored = (o.departures as unknown[]).find(
          (d) => (d as { placeId?: unknown })?.placeId === fallback.placeId
        );
        return readDeparture(stored, fallback);
      }),
      days: readDays(o.days),
    };
  } catch {
    return DEFAULT_COMMUTE;
  }
}

export async function saveCommute(next: CommuteSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // a setting that cannot be persisted still applies for this session
  }
}

/**
 * Whether this departure has already been briefed today.
 *
 * A background task may run several times in a morning, and the same umbrella
 * warning arriving three times teaches you to swipe it away without reading.
 *
 * Kept per departure rather than per day. A single day-stamp was fine while there
 * was one time; with two, the 8 AM briefing would mark the day done and silence
 * the 7 PM one — the failure would look exactly like the evening briefing being
 * broken, and it would only ever happen after the morning had worked.
 */
async function sentLog(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SENT_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    // includes the pre-departures value, which was a bare `YYYY-MM-DD` string and
    // does not parse — an unreadable log means "not yet briefed", so at worst one
    // extra briefing arrives on the day of the upgrade
    return {};
  }
}

export async function alreadyBriefed(placeId: string, today: string): Promise<boolean> {
  return (await sentLog())[placeId] === today;
}

export async function markBriefed(placeId: string, today: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SENT_KEY, JSON.stringify({ ...(await sentLog()), [placeId]: today }));
  } catch {
    /* a repeat is better than no briefing at all */
  }
}

/**
 * Whether the gateway is arming the briefing, so the phone does not post it too.
 *
 * On 2026-08-21 the same briefing arrived twice. Both senders were real: this
 * phone's WorkManager task and the gateway's push, each holding its own once-a-day
 * marker — `jarvis_commute_sent` here, `_briefed` there — and neither able to see
 * the other's. The gateway's text is a deliberate byte-for-byte port of
 * `commuteBriefing`, so the notification shade could not tell them apart either.
 *
 * The phone half was always described as a fallback and was never gated, which
 * made it a second sender. This is the gate: a successful upload stamps the clock,
 * and the task declines to post while that stamp is fresh.
 *
 * **The direction of the failure is chosen.** A missing, unreadable or stale stamp
 * reads as "not armed", so the phone posts. A duplicate is an annoyance; a morning
 * with no briefing is the feature not existing — and this app has already spent
 * four days reading a correct silence as a broken feature.
 */
const CLOUD_KEY = 'jarvis_commute_cloud';

/**
 * How long an upload is trusted for.
 *
 * Long enough that the app does not have to be opened daily — the gateway keeps
 * the schedule and briefs without it, which is the entire point of moving the
 * briefing there. Short enough that a gateway which has been unreachable for two
 * days is assumed redeployed and wiped, because Render's disk goes on every deploy
 * and that has silently disarmed the briefing twice.
 */
export const CLOUD_TTL_HOURS = 48;

export async function markCloudArmed(at: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(CLOUD_KEY, String(at));
  } catch {
    // an unwritten stamp means the phone posts as well for one more window, which
    // is the failure to prefer over a silent morning
  }
}

export async function cloudArmed(now: Date = new Date()): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(CLOUD_KEY);
    const at = Number(raw);
    if (!raw || !Number.isFinite(at)) return false;
    const age = now.getTime() - at;
    // a negative age is a clock that moved, not an upload from the future
    return age >= 0 && age <= CLOUD_TTL_HOURS * 3_600_000;
  } catch {
    return false;
  }
}

/**
 * `never` means no upload has ever been accepted, so the phone is certainly the
 * briefer. `stale` means one was, long enough ago that it proves nothing now.
 */
export type CloudArmedState = 'armed' | 'stale' | 'never';

/**
 * The same read as `cloudArmed`, but it distinguishes the two ways of not being armed.
 *
 * `cloudArmed` collapses them on purpose — the task's decision is binary and the
 * direction of its failure is chosen. Displaying it is the opposite problem: a stamp
 * that has merely aged is not evidence that the gateway lost the schedule, and a row
 * reading `ON THIS PHONE` for both is asserting something the phone cannot know.
 *
 * Why the stamp ages while the gateway may be armed perfectly well: it is written only
 * by `syncCommute`, and that effect returns early unless the link is `cloud`
 * (`JarvisProvider.tsx`) — `api.syncCommute` is a gateway route, so there is no LAN
 * upload to stamp. A week of workspace-only sessions is enough to age it out.
 *
 * A stamp from the future is `stale` rather than `armed`: the clock moved, so the age
 * is meaningless, and meaningless must not read as proved. An unreadable stamp is
 * `never` rather than `stale`, because a store that cannot be read is not evidence
 * that an upload once happened.
 *
 * Nothing here changes what the task does. `cloudArmed` is still the gate.
 */
export async function cloudArmedState(now: Date = new Date()): Promise<CloudArmedState> {
  try {
    const raw = await AsyncStorage.getItem(CLOUD_KEY);
    const at = Number(raw);
    if (!raw || !Number.isFinite(at)) return 'never';
    const age = now.getTime() - at;
    if (age < 0) return 'stale';
    return age <= CLOUD_TTL_HOURS * 3_600_000 ? 'armed' : 'stale';
  } catch {
    return 'never';
  }
}

export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * How long BEFORE the set time a briefing may go out — and it is before only.
 *
 * It used to be a window either side, and the gateway went further: it fired at the
 * time or up to twenty minutes after, on the reasoning that an early warning is
 * worth less. Asked for directly on 2026-08-21 and the request is right: **a
 * briefing that arrives as you reach the door is too late to change what you pick
 * up.** An umbrella has to be decided before the shoes are on.
 *
 * So 8:00 AM means somewhere in 7:30–8:00, and a 7 PM departure means 6:30–7:00.
 * Nothing fires after the time: past it the advice is about a walk already underway.
 */
export const DUE_WINDOW_MIN = 30;

/**
 * Which departure is due, if any.
 *
 * A window rather than an instant: Android decides when the task runs, so
 * "at 8:00 AM" has to mean "some time around when you leave". The two departures
 * are hours apart, so at most one can match; the first is returned regardless, and
 * a settings screen that let them overlap would be the bug to fix.
 */
/**
 * The next briefing owed today, or null.
 *
 * Distinct from `dueDeparture`, which answers "is one owed right NOW" for the
 * task that has to decide whether to post. This answers "is one coming", which
 * is what a line at the top of the chat wants: it looks forward rather than at a
 * window, and it returns the earliest of several rather than the first match.
 *
 * Null when the day is off, when nothing is switched on, or when today's are all
 * behind us — announcing a briefing already sent reads as a promise, and the
 * promise was kept an hour ago.
 */
export async function dueToday(
  now: Date = new Date()
): Promise<{ hour: number; minute: number; label: string } | null> {
  const s = await loadCommute();
  if (!s.days[now.getDay()]) return null;
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const ahead = s.departures
    .filter((d) => d.on && d.hour * 60 + d.minute > minutesNow)
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  const next = ahead[0];
  return next ? { hour: next.hour, minute: next.minute, label: next.label } : null;
}

export function dueDeparture(now: Date, s: CommuteSettings): Departure | null {
  if (!s.days[now.getDay()]) return null;
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return (
    s.departures.find((d) => {
      if (!d.on) return false;
      const target = d.hour * 60 + d.minute;
      // before the time, never after: see the note on `DUE_WINDOW_MIN`
      return minutesNow >= target - DUE_WINDOW_MIN && minutesNow <= target;
    }) ?? null
  );
}

type Hourly = {
  time?: string[];
  temperature_2m?: number[];
  precipitation_probability?: number[];
  precipitation?: number[];
  weather_code?: number[];
  wind_speed_10m?: number[];
};

const THUNDER = new Set([95, 96, 99]);

/**
 * Build the briefing, or return null when there is nothing worth saying.
 *
 * Silence is a real answer here: a notification every morning that says "it's
 * fine" is one you stop reading, and then you miss the morning it does not.
 */
export async function commuteBriefing(
  lat: number,
  lon: number,
  d: Departure,
  now = new Date(),
  /**
   * Where the wording comes from.
   *
   * Injected rather than reached for, so a test can hand in a known cursor and
   * assert the whole rotation. The default is the real one, so no caller changes.
   */
  voice?: Voice
): Promise<BriefingOutcome> {
  try {
    const url =
      `${OPEN_METEO}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m' +
      '&forecast_days=2&timezone=auto';
    const res = await fetch(url);
    if (!res.ok) return { state: 'unavailable', reason: 'http' };
    const data = (await res.json()) as { hourly?: Hourly };
    const hourly = data.hourly;
    if (!hourly?.time?.length) return { state: 'unavailable', reason: 'no-hours' };

    // the departure hour and the two after it, matched by local hour rather than
    // by index — the array starts at midnight, but only in the API's timezone
    const wanted = [d.hour, d.hour + 1, d.hour + 2].map((h) => h % 24);
    const todayStamp = dayKey(now);
    const rows: number[] = [];
    hourly.time.forEach((iso, i) => {
      const [date, clock] = iso.split('T');
      if (date !== todayStamp) return;
      if (wanted.includes(Number((clock ?? '').slice(0, 2)))) rows.push(i);
    });
    // a forecast that answered, but not about the hours being asked about. Still an
    // absence of knowledge rather than a quiet morning, so the day is not consumed
    if (!rows.length) return { state: 'unavailable', reason: 'no-window' };

    const pick = (arr?: number[]) => rows.map((i) => arr?.[i]).filter((v): v is number => typeof v === 'number');
    const temps = pick(hourly.temperature_2m);
    const chances = pick(hourly.precipitation_probability);
    const mm = pick(hourly.precipitation);
    const winds = pick(hourly.wind_speed_10m);
    const codes = pick(hourly.weather_code);

    const maxChance = chances.length ? Math.max(...chances) : 0;
    const totalMm = mm.reduce((a, b) => a + b, 0);
    const maxTemp = temps.length ? Math.max(...temps) : null;
    const minTemp = temps.length ? Math.min(...temps) : null;
    const maxWind = winds.length ? Math.max(...winds) : 0;
    const storm = codes.some((c) => THUNDER.has(c));

    /**
     * The voice is JARVIS's, and it is load-bearing. Four rules, in order:
     *
     * 1. **The figure comes first, the remark second.** These lines are read
     *    half-awake on a lock screen by someone deciding whether to pick something
     *    up on the way out. A recommendation with no measurement behind it cannot
     *    be disagreed with, and "Take an umbrella" from a machine that will not say
     *    why is the tone this app exists to avoid.
     * 2. **The remark never replaces the instruction, it follows it.** Android
     *    truncates a notification body in the shade; whatever survives the cut has
     *    to be the actionable half. This is why the needle is always last.
     * 3. **`sir` at most once per message, and the title already spends it.** It is
     *    punctuation, not deference — repeated in every clause it stops reading as
     *    dry and starts reading as servile, which is a different character.
     * 4. **No exclamation marks, ever.** Understatement is the whole instrument.
     *
     * The dry-with-a-needle register was chosen deliberately (2026-08-19) over a
     * flatter one. It is banned in exactly two places, both of them here in spirit
     * and enforced in `commuteTask.ts` and `JarvisProvider.tsx`: the desk-watch
     * alert, which is a security prompt on a lock deadline, and the `unavailable`
     * path, whose entire job is admitting he does not know — a joke there sounds
     * like an answer.
     */
    /**
     * The figure is measured, the remark is drawn, and the join is what enforces
     * rule 1.
     *
     * Every line here used to be one string with both halves in it, which meant the
     * ordering was a thing a rewrite could get wrong — and the test that guards it
     * says so explicitly. Now the figure cannot follow the remark, because the
     * template does not allow it.
     *
     * The figures themselves are deliberately NOT varied. A measurement rephrased
     * for novelty is one you can no longer compare with yesterday's, and comparing
     * is most of what a morning figure is for.
     */
    const v = voice ?? (await openVoice());
    const notes: string[] = [];
    const say = (figure: string, slot: Slot) => notes.push(`${figure} ${v.remark(slot)}`);

    if (storm) {
      say('Thunderstorms forecast.', 'storm');
    }
    if (maxChance >= RAIN_CHANCE || totalMm >= RAIN_MM) {
      say(
        `A ${Math.round(maxChance)}% chance of rain on your way out` +
          (totalMm >= RAIN_MM ? `, around ${totalMm.toFixed(1)} mm` : '') +
          '.',
        'rain'
      );
    }
    if (maxTemp !== null && maxTemp >= HOT_C) {
      say(`It reaches ${Math.round(maxTemp)}°C today.`, 'hot');
    }
    if (minTemp !== null && minTemp <= COLD_C) {
      say(`Down to ${Math.round(minTemp)}°C.`, 'cold');
    }
    if (maxWind >= WINDY_KMH) {
      say(`Gusts to ${Math.round(maxWind)} km/h.`, 'wind');
    }

    // both ends carry the meridiem even when they share one: this label read
    // "08:00–11:00" on a briefing its owner believed was set for the evening, and
    // the redundancy is what would have shown him otherwise
    const window = `${hourLabel(d.hour)}–${hourLabel((d.hour + 3) % 24)}`;

    /**
     * A quiet day still gets a briefing, and it carries the figures.
     *
     * The original design stayed silent here, on the reasoning that a notification
     * every morning saying "it's fine" is one you stop reading. That was overruled
     * deliberately on 2026-08-18: silence is indistinguishable from the feature
     * being broken, and it had been read as broken for four days straight — the
     * 7 PM briefing on the 18th was correct silence and cost an evening of
     * debugging to prove it.
     *
     * So the reassurance is not the word "fine". It names the temperature, the rain
     * chance and the wind, which is enough to disagree with if it is wrong — an
     * empty "nothing to worry about" would be the same unfalsifiable silence with a
     * buzz attached.
     */
    if (!notes.length) {
      const clear = {
        state: 'clear' as const,
        briefing: {
          title: v.title('clear', d.label),
          body:
            `Nothing to carry. ${maxTemp === null ? '' : `${Math.round(maxTemp)}°C, `}` +
            `a ${Math.round(maxChance)}% chance of rain, wind ${Math.round(maxWind)} km/h (${window}). ` +
            v.remark('clear'),
        },
      };
      await v.commit();
      return clear;
    }

    const briefing = {
      state: 'briefing' as const,
      briefing: {
        // named in every variant, because two of these arrive in a day and a shade
        // holding both has to say which door each one is about
        title: v.title('warn', d.label),
        body: `${notes.join(' ')} (${window})`,
      },
    };
    /**
     * Committed only on a message that is actually going out.
     *
     * The `unavailable` paths return before this, which is the behaviour that
     * matters: a failed lookup must not burn a line. Six failed runs would
     * otherwise spend the whole pool and the next real briefing would arrive on the
     * same wording as the last one — the exact complaint, reintroduced by the
     * failure path.
     */
    await v.commit();
    return briefing;
  } catch {
    // the common one, and the reason this function stopped returning null: a
    // headless task in Android's RARE standby bucket has its network blocked, so
    // `fetch` rejects here on every scheduled run
    return { state: 'unavailable', reason: 'network' };
  }
}
