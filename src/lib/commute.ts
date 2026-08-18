import AsyncStorage from '@react-native-async-storage/async-storage';

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
  /** the forecast was read, and there is nothing worth carrying anything for */
  | { state: 'clear' }
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

export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** how wide either side of the set time still counts as "now" */
export const DUE_WINDOW_MIN = 30;

/**
 * Which departure is due, if any.
 *
 * A window rather than an instant: Android decides when the task runs, so
 * "at 8:00 AM" has to mean "some time around when you leave". The two departures
 * are hours apart, so at most one can match; the first is returned regardless, and
 * a settings screen that let them overlap would be the bug to fix.
 */
export function dueDeparture(now: Date, s: CommuteSettings): Departure | null {
  if (!s.days[now.getDay()]) return null;
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return (
    s.departures.find((d) => {
      if (!d.on) return false;
      const target = d.hour * 60 + d.minute;
      return minutesNow >= target - DUE_WINDOW_MIN && minutesNow <= target + DUE_WINDOW_MIN;
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
  now = new Date()
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

    const notes: string[] = [];
    if (storm) notes.push('Thunderstorms forecast — worth leaving early or waiting it out.');
    if (maxChance >= RAIN_CHANCE || totalMm >= RAIN_MM) {
      notes.push(
        `Rain likely on the way out — ${Math.round(maxChance)}% chance` +
          (totalMm >= RAIN_MM ? `, around ${totalMm.toFixed(1)} mm` : '') +
          '. Take an umbrella.'
      );
    }
    if (maxTemp !== null && maxTemp >= HOT_C) {
      notes.push(`It reaches ${Math.round(maxTemp)}°C — carry water, and something for your head.`);
    }
    if (minTemp !== null && minTemp <= COLD_C) {
      notes.push(`Down to ${Math.round(minTemp)}°C — take a jacket.`);
    }
    if (maxWind >= WINDY_KMH) notes.push(`Windy, gusting ${Math.round(maxWind)} km/h.`);

    // the one silence that is an answer: read, and there is nothing to say
    if (!notes.length) return { state: 'clear' };

    // both ends carry the meridiem even when they share one: this label read
    // "08:00–11:00" on a briefing its owner believed was set for the evening, and
    // the redundancy is what would have shown him otherwise
    const window = `${hourLabel(d.hour)}–${hourLabel((d.hour + 3) % 24)}`;
    return {
      state: 'briefing',
      briefing: {
        // named, because two of these arrive in a day and a shade holding both has
        // to say which door each one is about
        title: `Before you leave ${d.label}`,
        body: `${notes.join(' ')} (${window})`,
      },
    };
  } catch {
    // the common one, and the reason this function stopped returning null: a
    // headless task in Android's RARE standby bucket has its network blocked, so
    // `fetch` rejects here on every scheduled run
    return { state: 'unavailable', reason: 'network' };
  }
}
