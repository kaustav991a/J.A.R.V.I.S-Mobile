import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where the phone is, when something actually asks.
 *
 * **One-shot, foreground only.** No background permission is ever requested and no
 * watcher is ever started: a location that is only taken while answering a question
 * costs nothing when the app is closed, needs no `ACCESS_BACKGROUND_LOCATION`, and
 * cannot quietly become a tracker. The trail below is built from these same
 * one-shot reads, so it only ever grows while the app is being used.
 *
 * The place name is resolved here rather than on the gateway: the reverse geocoder
 * is on the device, so it costs no request and no third party is told where he is
 * in order to put a name on it.
 */
export type Fix = {
  lat: number;
  lon: number;
  /**
   * How wide the reading is, in metres, as the platform reports it.
   *
   * Carried because naming a place is a comparison, not a measurement: with two named
   * places 150 m apart and a reading good to 100 m, choosing either is a coin toss.
   * The place matcher refuses rather than guessing, and this is what it refuses on.
   */
  accuracy?: number;
  /**
   * Height above the reference ellipsoid, in metres, and how wide that is.
   *
   * Kept because it was asked for — "we are on the 6th floor, can we do anything
   * about it" — and kept with its error beside it because the answer is no. GPS
   * puts vertical error at roughly one and a half to three times the horizontal,
   * so a reading good to 15 m on the ground is good to perhaps 40 m in height,
   * against a floor of about three. It can say "a building", never "the sixth
   * floor". A barometer could, and is a native build away.
   */
  altitude?: number;
  altitudeAccuracy?: number;
  /** e.g. "Salt Lake, West Bengal" — empty when the geocoder had nothing */
  place: string;
};

export type TrailStep = { place: string; when: string; at: number };

const TRAIL_KEY = 'jarvis_place_trail';

/** how many places are remembered, and how long any of them is kept */
export const TRAIL_KEEP = 12;
export const TRAIL_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Two fixes closer together than this are the same place as far as a trail is
 * concerned — otherwise sitting still for an afternoon fills it with one address.
 */
const SAME_PLACE_KM = 0.4;

const km = (a: Fix, b: { lat: number; lon: number }): number => {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/**
 * Ask for the fine-location permission, foreground only.
 *
 * Returns false rather than throwing on refusal or on a build without the module —
 * a phone that will not say where it is still answers questions, and the caller
 * simply sends none.
 */
export async function askForLocation(): Promise<boolean> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

export async function hasLocation(): Promise<boolean> {
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

let fixCache: { fix: Fix; at: number } | null = null;

/**
 * A single fix, with a name on it.
 *
 * **`High` accuracy as of 2026-09-01, and this comment used to argue the opposite.**
 * It said a hundred metres was irrelevant because the fix answered "what is the
 * weather here" — true when it was written, and false once the same reading began
 * deciding which named place you are standing in. That is the whole of the bug
 * recorded at the accuracy setting below. The name is still best-effort: a fix with
 * no address is a usable fix.
 *
 * `maxAgeMs` accepts a recent fix instead of taking a new one, and defaults to 0
 * — every existing caller still gets a fresh reading, because naming the place you
 * are standing in must not be answered from where you were.
 *
 * Chat passes a value, and that is where it matters: a GPS fix plus a reverse
 * geocode ran *before* every message left the phone, so each turn paid seconds of
 * silence that looked like the cloud brain thinking. Nobody moves far enough
 * between two messages of a conversation for the coordinate to have changed.
 */
export const FIX_TTL_MS = 3 * 60 * 1000;

export async function currentFix(maxAgeMs = 0): Promise<Fix | null> {
  if (maxAgeMs > 0 && fixCache && Date.now() - fixCache.at <= maxAgeMs) return fixCache.fix;
  try {
    const position = await Location.getCurrentPositionAsync({
      /**
       * High accuracy, not balanced, and the reason changed under this call.
       *
       * The balanced setting is around a hundred metres and is derived from wifi and cell rather
       * than GPS. That was right while a fix only answered "what is the weather here";
       * it is wrong now that the same fix decides WHICH NAMED PLACE you are standing
       * in. Wifi positioning anchors to routers it knows — his own — so from 150 m
       * down the road it kept handing back the coordinates of his living room, and the
       * app kept saying Home. Reported from the phone on 2026-09-01.
       */
      accuracy: Location.Accuracy.High,
    });
    const { latitude, longitude } = position.coords;
    let place = '';
    try {
      const [found] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (found) {
        /**
         * Neighbourhood, then city, then the administrative region — in that
         * order, and `subregion` last of all.
         *
         * `subregion` used to come second, so one desk in Kolkata was reported
         * across four turns as Bidhannagar, Kankurgachi, and twice as **Presidency
         * Division** — an administrative division covering millions of people,
         * offered as though it were an address. Android fills these fields
         * inconsistently between calls, so the order decides what gets said, and
         * a coarse field ranked above a precise one produces exactly that drift.
         */
        place = [found.district || found.city || found.subregion, found.region]
          .filter(Boolean)
          .join(', ');
      }
    } catch {
      // an unnamed fix is still worth sending; the gateway prints coordinates
    }
    const fix = {
      lat: latitude,
      lon: longitude,
      place,
      accuracy: position.coords.accuracy ?? undefined,
      altitude: position.coords.altitude ?? undefined,
      altitudeAccuracy: position.coords.altitudeAccuracy ?? undefined,
    };
    fixCache = { fix, at: Date.now() };
    return fix;
  } catch {
    return null;
  }
}

/**
 * How far you have to move before the dot moves.
 *
 * Metres rather than seconds: a phone on a desk costs nothing, and a phone in a
 * pocket updates as fast as it travels. Five metres is under the accuracy of a good
 * fix, so the dot keeps up with a walk without jittering in place.
 */
export const WATCH_METRES = 5;

/**
 * Follow the fix while somebody is looking at it.
 *
 * The map panel took a single cached fix when Home came into focus, which is right
 * for *where am I* and wrong for watching yourself move: the dot sat still while the
 * person did not. Reported from the phone on 2026-09-02 — *"im not getting realtime
 * GPS dot as seen on map"*.
 *
 * Returns the stopper rather than taking a cleanup callback, so a screen can hand it
 * straight to an effect. **Nothing here reverse-geocodes.** The name of the place is
 * a network round trip and this fires every few metres; the panel needs coordinates
 * and an accuracy, and the naming stays on the slower path that already does it.
 */
export async function watchFix(onFix: (fix: Fix) => void): Promise<() => void> {
  try {
    const subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: WATCH_METRES },
      (position) => {
        const { latitude, longitude, accuracy, altitude, altitudeAccuracy } = position.coords;
        onFix({
          lat: latitude,
          lon: longitude,
          place: '',
          accuracy: accuracy ?? undefined,
          altitude: altitude ?? undefined,
          altitudeAccuracy: altitudeAccuracy ?? undefined,
        });
      }
    );
    return () => subscription.remove();
  } catch {
    // a refused or unavailable watch leaves the cached fix on screen, which is the
    // behaviour this replaces rather than a failure
    return () => {};
  }
}

/** the remembered trail, oldest first, with anything stale dropped */
export async function loadTrail(): Promise<TrailStep[]> {
  try {
    const raw = await AsyncStorage.getItem(TRAIL_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - TRAIL_TTL_MS;
    return parsed
      .filter(
        (s): s is TrailStep =>
          s !== null &&
          typeof s === 'object' &&
          typeof (s as TrailStep).place === 'string' &&
          typeof (s as TrailStep).at === 'number' &&
          (s as TrailStep).at > cutoff
      )
      .slice(-TRAIL_KEEP);
  } catch {
    return [];
  }
}

/**
 * Add a fix to the trail, unless it is where he already was.
 *
 * Kept on the phone deliberately: the gateway stores none of this, so the only
 * copy is the one on the device that can be wiped from Settings. It leaves only
 * when a question is asked that needs it.
 */
export async function rememberPlace(fix: Fix): Promise<void> {
  if (!fix.place) return;
  try {
    const trail = await loadTrail();
    const last = trail[trail.length - 1];
    if (last && km(fix, last as unknown as { lat: number; lon: number }) < SAME_PLACE_KM) return;
    if (last && last.place === fix.place) return;
    const step: TrailStep = {
      place: fix.place,
      when: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      at: Date.now(),
      // the coordinates ride along so the next comparison can be by distance
      ...({ lat: fix.lat, lon: fix.lon } as object),
    };
    await AsyncStorage.setItem(TRAIL_KEY, JSON.stringify([...trail, step].slice(-TRAIL_KEEP)));
  } catch {
    // a trail that cannot be written is a trail that does not exist, which is fine
  }
}

/**
 * Current conditions, fetched from the phone rather than from the gateway.
 *
 * The gateway tried this first and was answered `429 Too Many Requests`:
 * Open-Meteo rate-limits per IP, and Render's outbound address is shared with
 * everyone else on the host, so it is permanently near the limit. A phone has its
 * own address and asks a handful of times a day.
 *
 * It also puts the request where the coordinates already are, so the gateway stops
 * making an HTTP call on every located turn and simply relays a figure it was
 * given.
 */
const WMO: Record<number, string> = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'freezing fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  56: 'freezing drizzle', 57: 'freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain',
  66: 'freezing rain', 67: 'heavy freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'light showers', 81: 'showers', 82: 'violent showers',
  85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail',
};

const WEATHER_TTL_MS = 10 * 60 * 1000;
let weatherCache: { key: string; at: number; line: string } | null = null;

export async function weatherFor(lat: number, lon: number): Promise<string | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (weatherCache && weatherCache.key === key && Date.now() - weatherCache.at < WEATHER_TTL_MS) {
    return weatherCache.line;
  }
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m' +
      '&daily=precipitation_probability_max&forecast_days=1&timezone=auto';
    const res = await fetch(url);
    if (!res.ok) return weatherCache?.key === key ? weatherCache.line : null;
    const data: {
      current?: Record<string, number> & { time?: string };
      daily?: { precipitation_probability_max?: number[] };
    } = await res.json();
    // Open-Meteo stamps `current` with the local time of the observation
    const observedAt = data.current?.time;
    const now = data.current ?? {};
    const said = WMO[now.weather_code as number] ?? 'unclear conditions';
    const chance = data.daily?.precipitation_probability_max?.[0];
    /**
     * Every figure says what it is, in full, at the cost of being wordy.
     *
     * The terse version cost more than it saved. `27.8°C (feels 33.7°C)` came back
     * two turns later as "the conditions I have are from a bit earlier — 27.6°C",
     * with the two numbers presented as a correction rather than as the same
     * reading twice; and `rain chance today 98%` was repeatedly reported as a 98%
     * chance of rain *now*. A label that can be dropped will be dropped, so the
     * qualifier is inside the phrase rather than beside it.
     */
    const parts = [
      said,
      `air temperature ${now.temperature_2m}°C`,
      `feels like ${now.apparent_temperature}°C`,
      `humidity ${now.relative_humidity_2m}%`,
      `wind ${now.wind_speed_10m} km/h`,
    ];
    // the figure that settles "is it raining": measured, in the last hour
    if (typeof now.precipitation === 'number') parts.push(`precipitation ${now.precipitation} mm in the last hour`);
    if (typeof chance === 'number') parts.push(`chance of rain at some point later today ${chance}%`);
    // Stamped, because without one the model invented the age of the reading —
    // "from a bit earlier, Sir" was said about figures fetched seconds before.
    if (typeof observedAt === 'string') parts.push(`measured at ${observedAt}`);
    const line = parts.join(', ');
    weatherCache = { key, at: Date.now(), line };
    return line;
  } catch {
    // a stale reading beats no reading; a wrong one is what we are avoiding
    return weatherCache?.key === key ? weatherCache.line : null;
  }
}

const SHARE_KEY = 'jarvis_share_location';

/**
 * Whether questions carry a location, persisted.
 *
 * `AsyncStorage` alongside the trail rather than `SecureStore`: it is a preference,
 * not a credential, and keeping the switch next to the data it governs means
 * clearing app storage cannot leave one without the other.
 */
export async function loadShareLocation(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SHARE_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function saveShareLocation(on: boolean): Promise<void> {
  try {
    if (on) await AsyncStorage.setItem(SHARE_KEY, '1');
    else await AsyncStorage.removeItem(SHARE_KEY);
  } catch {
    // a preference that cannot be saved still applies for this session
  }
}

/** forget everywhere he has been */
export async function forgetTrail(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TRAIL_KEY);
  } catch {
    // nothing stored is the state we wanted anyway
  }
}
