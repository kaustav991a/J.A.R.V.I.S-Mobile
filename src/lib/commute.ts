import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The morning briefing: what the commute looks like, and what to carry.
 *
 * Advice comes from thresholds on real figures, never from the model. "Take an
 * umbrella" has to be true — a hallucinated umbrella is worse than no briefing,
 * because it is the one thing a person acts on without checking.
 *
 * The window is the departure hour and the two after it, not the whole day. A
 * daily maximum says it will rain at some point in the next 24 hours, which is not
 * the question being asked on the way out of the door.
 */
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

export type CommuteSettings = {
  on: boolean;
  /** 24h local time the briefing is for */
  hour: number;
  minute: number;
  /** Monday to Friday only — a Sunday umbrella warning is noise */
  weekdaysOnly: boolean;
};

export const DEFAULT_COMMUTE: CommuteSettings = { on: false, hour: 9, minute: 0, weekdaysOnly: true };

const SETTINGS_KEY = 'jarvis_commute';
const LAST_SENT_KEY = 'jarvis_commute_sent';

/** thresholds, in one place so they can be argued with */
export const RAIN_CHANCE = 50;
export const RAIN_MM = 0.4;
export const HOT_C = 35;
export const COLD_C = 12;
export const WINDY_KMH = 40;

export type Briefing = { title: string; body: string };

export async function loadCommute(): Promise<CommuteSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_COMMUTE;
    const parsed = JSON.parse(raw) as Partial<CommuteSettings>;
    return {
      on: parsed.on === true,
      hour: typeof parsed.hour === 'number' && parsed.hour >= 0 && parsed.hour < 24 ? parsed.hour : 9,
      minute: typeof parsed.minute === 'number' && parsed.minute >= 0 && parsed.minute < 60 ? parsed.minute : 0,
      weekdaysOnly: parsed.weekdaysOnly !== false,
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
 * Whether today has already been briefed.
 *
 * A background task may run several times in a morning, and the same umbrella
 * warning arriving three times teaches you to swipe it away without reading.
 */
export async function alreadyBriefed(today: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LAST_SENT_KEY)) === today;
  } catch {
    return false;
  }
}

export async function markBriefed(today: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SENT_KEY, today);
  } catch {
    /* a repeat is better than no briefing at all */
  }
}

export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** true when the briefing is due: within the half hour before the set time */
export function briefingDue(now: Date, s: CommuteSettings): boolean {
  if (!s.on) return false;
  if (s.weekdaysOnly && (now.getDay() === 0 || now.getDay() === 6)) return false;
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const target = s.hour * 60 + s.minute;
  // a window rather than an instant: Android decides when the task runs, so
  // "at 09:00" has to mean "some time in the half hour before you leave"
  return minutesNow >= target - 30 && minutesNow <= target + 30;
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
export async function commuteBriefing(lat: number, lon: number, s: CommuteSettings, now = new Date()): Promise<Briefing | null> {
  try {
    const url =
      `${OPEN_METEO}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m' +
      '&forecast_days=2&timezone=auto';
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { hourly?: Hourly };
    const hourly = data.hourly;
    if (!hourly?.time?.length) return null;

    // the departure hour and the two after it, matched by local hour rather than
    // by index — the array starts at midnight, but only in the API's timezone
    const wanted = [s.hour, s.hour + 1, s.hour + 2].map((h) => h % 24);
    const todayStamp = dayKey(now);
    const rows: number[] = [];
    hourly.time.forEach((iso, i) => {
      const [date, clock] = iso.split('T');
      if (date !== todayStamp) return;
      if (wanted.includes(Number((clock ?? '').slice(0, 2)))) rows.push(i);
    });
    if (!rows.length) return null;

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

    if (!notes.length) return null;

    const window = `${String(s.hour).padStart(2, '0')}:00–${String((s.hour + 3) % 24).padStart(2, '0')}:00`;
    return {
      title: 'Before you head out',
      body: `${notes.join(' ')} (${window})`,
    };
  } catch {
    return null;
  }
}
