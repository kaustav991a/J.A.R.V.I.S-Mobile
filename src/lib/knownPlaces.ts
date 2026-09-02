import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Fix } from './place';

/**
 * Places with names on them — home, the office, wherever else is worth naming.
 *
 * Taught by standing somewhere and saying "this is home", rather than by typing
 * coordinates or searching a map: the phone already knows where it is, and the one
 * moment you are certain of a place is while you are in it.
 *
 * Kept on the phone with everything else about location. They travel in the `where`
 * envelope when a question is asked, so the gateway can answer "how far to the
 * office" without geocoding a word only this phone knows the meaning of.
 */
export type KnownPlace = {
  /** `home` and `office` are fixed slots; anything else is user-named */
  id: string;
  label: string;
  lat: number;
  lon: number;
  /** what the reverse geocoder called it, for showing back to the user */
  area: string;
};

const KEY = 'jarvis_known_places';

/** the two everyone has, in the order they are shown */
export const FIXED_SLOTS: { id: string; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'office', label: 'Office' },
];

export const KNOWN_CAP = 12;

export async function loadKnown(): Promise<KnownPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is KnownPlace =>
          p !== null &&
          typeof p === 'object' &&
          typeof (p as KnownPlace).id === 'string' &&
          typeof (p as KnownPlace).label === 'string' &&
          typeof (p as KnownPlace).lat === 'number' &&
          typeof (p as KnownPlace).lon === 'number'
      )
      .slice(0, KNOWN_CAP);
  } catch {
    return [];
  }
}

async function write(places: KnownPlace[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(places.slice(0, KNOWN_CAP)));
  } catch {
    // a place that cannot be saved is one he will be asked to set again
  }
}

/**
 * Name where he is now.
 *
 * Replaces any place with the same id, so "set as home" from a new flat updates
 * rather than accumulating two homes.
 */
export async function nameHere(id: string, label: string, fix: Fix): Promise<KnownPlace[]> {
  const places = await loadKnown();
  const next: KnownPlace = { id, label, lat: fix.lat, lon: fix.lon, area: fix.place };
  const merged = [...places.filter((p) => p.id !== id), next];
  await write(merged);
  return merged;
}

export async function forgetPlace(id: string): Promise<KnownPlace[]> {
  const places = (await loadKnown()).filter((p) => p.id !== id);
  await write(places);
  return places;
}

export async function forgetAllPlaces(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // nothing stored is the state we wanted anyway
  }
}

/** how far he is from a named place, in km — for "am I at the office" questions */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Within this many km of a named place counts as being there.
 *
 * Was 250 m, and reported from the phone on 2026-09-01: Home and a named area about
 * 150 metres apart, each sitting inside the other's circle, so walking between them
 * never changed what the app said. 120 m is tight enough to separate two places on
 * one street and loose enough for a fix taken indoors.
 */
export const AT_PLACE_KM = 0.12;

/**
 * How close two places have to be before one walk can leave both.
 *
 * His home and Laxminath Nagar are about 150 m apart and their circles overlap, so
 * stepping out of the door crosses both boundaries inside a minute. That is a real
 * pair of departures and it looks exactly like the platform's restart sweep, which
 * also reports several places at once — the difference is distance. Nobody leaves
 * two places half a kilometre apart in the same breath.
 */
export const NEIGHBOUR_KM = 0.5;

/**
 * A test for "could one walk have left both of these?", by label.
 *
 * Unknown labels answer false — not far apart — because the cost of being wrong runs
 * one way: treating a real departure as a sweep deletes a sighting that cannot be
 * recovered, while keeping a false one costs a wrong figure that later data outvotes.
 */
export function farApart(places: KnownPlace[]): (a: string, b: string) => boolean {
  const at = new Map(places.map((p) => [p.label, p]));
  return (a, b) => {
    const one = at.get(a);
    const two = at.get(b);
    if (!one || !two) return false;
    return distanceKm(one, two) > NEIGHBOUR_KM;
  };
}

/**
 * The name of wherever he is standing, or null when it cannot honestly tell.
 *
 * **The second half is the fix for a real report.** A place has to win by more than
 * the reading's own error: with a hundred metres of uncertainty and two places a
 * hundred and fifty apart, naming either one is a coin toss reported as a fact, and
 * that is what put him at Home while he stood down the road. Null costs a remark;
 * the wrong name costs trust in every remark.
 *
 * The accuracy is in metres and optional — a fix without one is taken at its word,
 * which is how every caller behaved before this existed.
 */
export function nameFor(
  fix: { lat: number; lon: number; accuracy?: number },
  places: KnownPlace[]
): string | null {
  const errorKm = (fix.accuracy ?? 0) / 1000;
  // anywhere the reading cannot rule out, which is wider than the match radius when
  // the fix is poor — a neighbour just outside the circle is still a candidate for
  // having been the real position
  const near = places
    .map((p) => ({ p, km: distanceKm(fix, p) }))
    .filter((x) => x.km - errorKm <= AT_PLACE_KM)
    .sort((a, b) => a.km - b.km);

  const best = near[0];
  if (!best) return null;
  // inside the circle only because the error is wide is not being there
  if (best.km > AT_PLACE_KM) return null;

  const runnerUp = near[1];
  // a neighbour this close cannot be ruled out by a reading this loose
  if (runnerUp && runnerUp.km - best.km <= errorKm) return null;

  return best.p.label;
}
