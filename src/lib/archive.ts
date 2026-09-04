import { AT_PLACE_KM, distanceKm } from './knownPlaces';
import type { KnownPlace } from './knownPlaces';
import type { Seen } from './timeline';

/**
 * A Timeline export, turned into sightings or into questions.
 *
 * Pure by design. Everything difficult about the import is arithmetic over a list, and
 * a phone is a bad place to discover that one of the sums was wrong — so nothing here
 * reads a file, opens a database, or knows what time it is.
 */

/** one `visit` segment from the export, reduced to what a sighting needs */
export type Visit = {
  lat: number;
  lon: number;
  start: number;
  end: number;
  /**
   * Google's own guess, when the file carried one.
   *
   * `INFERRED_HOME` and `INFERRED_WORK` arrive for nothing — no key, no lookup, no
   * network. A hint on a question, never a label on a place.
   */
  hint?: 'home' | 'work';
};

/** how close two visits must be to be the same place, absent a name */
export const CLUSTER_KM = 0.1;

/**
 * How many visits make an unnamed cluster worth asking about.
 *
 * The export holds 238 distinct places. Asking about all of them is a list nobody
 * answers, and a list nobody answers is the same as no feature. Twenty visits is
 * somewhere he goes, not a shop he walked past.
 */
export const PROPOSE_MIN_VISITS = 20;

/** five minutes: one arrival, however many sources noticed it */
export const NEAR_MS = 5 * 60_000;

const minuteOfDay = (at: number): number => {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes();
};

const dayKey = (at: number): string => {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  // an even count takes the lower of the two middles, the same rule every other
  // median in this codebase follows
  return s.length % 2 ? s[mid] : s[mid - 1];
};

/**
 * The named place a visit happened at, or null.
 *
 * `<=` rather than `<`, because `nameFor` treats the boundary as inside and two
 * different answers for the same coordinate is a bug waiting for a bad afternoon.
 * Nearest wins where circles overlap — his home and Laxminath Nagar are 150 m apart.
 */
const placeFor = (v: Visit, places: KnownPlace[]): KnownPlace | null => {
  let best: KnownPlace | null = null;
  let bestKm = Infinity;
  for (const p of places) {
    const km = distanceKm(v, p);
    if (km <= AT_PLACE_KM && km < bestKm) {
      best = p;
      bestKm = km;
    }
  }
  return best;
};

/**
 * Every visit that landed somewhere he has named, as an arrival and a departure.
 *
 * A visit to a cluster he has never named is discarded here and proposed by
 * `unnamedClusters` instead. **The importer never invents a name** — that rule is older
 * than this feature and is the reason `nameFor` exists at all.
 */
export function matchVisits(visits: Visit[], places: KnownPlace[]): Seen[] {
  const out: Seen[] = [];
  for (const v of visits) {
    const p = placeFor(v, places);
    if (!p) continue;
    out.push({ place: p.label, at: v.start, via: 'import-enter' });
    out.push({ place: p.label, at: v.end, via: 'import-exit' });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Drop imported rows that describe an event the store already holds.
 *
 * The geofence recorded Sealdah at 9:23 and the export says 9:21. That is one arrival.
 * Two rows would not move a median — the medians are per day — but it would make the
 * store twice the size it needs to be and the diagnostics twice as hard to read, and a
 * second import has to be free rather than doubling.
 */
export function withoutNear(rows: Seen[], existing: Seen[], windowMs = NEAR_MS): Seen[] {
  return rows.filter(
    (r) => !existing.some((e) => e.place === r.place && Math.abs(e.at - r.at) <= windowMs)
  );
}

/**
 * What he is shown before a single row is written.
 *
 * **Days, not visits, is the number that matters** — four visits across three days is
 * three days of evidence, and a count of visits reads as more history than there is.
 * Both are shown, because the honest sentence needs both.
 */
export function importSummary(
  visits: Visit[],
  places: KnownPlace[]
): { place: string; visits: number; days: number; hour: number | null }[] {
  const per = new Map<string, { visits: number; days: Set<string>; arrivals: number[] }>();
  for (const v of visits) {
    const p = placeFor(v, places);
    if (!p) continue;
    const held = per.get(p.label) ?? { visits: 0, days: new Set<string>(), arrivals: [] };
    held.visits += 1;
    held.days.add(dayKey(v.start));
    held.arrivals.push(minuteOfDay(v.start));
    per.set(p.label, held);
  }
  return [...per.entries()]
    .map(([place, h]) => ({
      place,
      visits: h.visits,
      days: h.days.size,
      hour: h.arrivals.length ? median(h.arrivals) : null,
    }))
    .sort((a, b) => b.days - a.days || b.visits - a.visits);
}

export type Cluster = {
  lat: number;
  lon: number;
  visits: number;
  days: number;
  hour: number;
  hint?: 'home' | 'work';
};

/**
 * The places he has been to over and over and never had the app open at.
 *
 * This is the part of the import that removes a real limit rather than adding a
 * number: until now the only way to name somewhere was to be standing in it with the
 * app open, so a place visited two hundred times last year could never be named at all.
 *
 * The naming is still his. Google's guess is passed through as a `hint` because it
 * arrives in the file for nothing, but a hint decorates a question — it never becomes a
 * label. The other 236 clusters would need the Places Details API, a key, and his place
 * ids sent to Google, which is a trade this app has never made and does not start
 * making for prettier text.
 */
export function unnamedClusters(visits: Visit[], places: KnownPlace[]): Cluster[] {
  const groups: { lat: number; lon: number; hits: Visit[] }[] = [];
  for (const v of visits) {
    if (placeFor(v, places)) continue;
    const g = groups.find((x) => distanceKm(x, v) <= CLUSTER_KM);
    if (g) g.hits.push(v);
    else groups.push({ lat: v.lat, lon: v.lon, hits: [v] });
  }
  return groups
    .filter((g) => g.hits.length >= PROPOSE_MIN_VISITS)
    .map((g) => {
      const hint = g.hits.find((v) => v.hint)?.hint;
      const c: Cluster = {
        lat: g.lat,
        lon: g.lon,
        visits: g.hits.length,
        days: new Set(g.hits.map((v) => dayKey(v.start))).size,
        hour: median(g.hits.map((v) => minuteOfDay(v.start))),
      };
      return hint ? { ...c, hint } : c;
    })
    .sort((a, b) => b.visits - a.visits);
}

/** the span of the whole file, for the sentence that says what is about to happen */
export function visitRange(visits: Visit[]): { from: number; to: number } | null {
  if (!visits.length) return null;
  return {
    from: Math.min(...visits.map((v) => v.start)),
    to: Math.max(...visits.map((v) => v.end)),
  };
}
