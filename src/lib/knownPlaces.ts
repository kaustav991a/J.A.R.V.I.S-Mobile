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

/** within this many km of a named place counts as being there */
export const AT_PLACE_KM = 0.25;

/** the name of wherever he is standing, if it is somewhere he has named */
export function nameFor(fix: { lat: number; lon: number }, places: KnownPlace[]): string | null {
  const near = places
    .map((p) => ({ p, km: distanceKm(fix, p) }))
    .filter((x) => x.km <= AT_PLACE_KM)
    .sort((a, b) => a.km - b.km)[0];
  return near ? near.p.label : null;
}
