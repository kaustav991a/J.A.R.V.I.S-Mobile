import * as SQLite from 'expo-sqlite';

import type { Seen } from './timeline';

/**
 * Where sightings live now.
 *
 * They were one JSON blob in AsyncStorage, capped at 1,200 rows and filtered to the
 * last 84 days on every read — so the store quietly destroyed the history that every
 * habit figure in this app is built from. That was survivable while the only source
 * was somebody opening the app. It is not survivable with a Timeline export of
 * seventeen months, and it was never a good reason for *"usually you leave at seven"*
 * to rest on twelve weeks.
 *
 * The table is the whole change. Everything above this file still takes `Seen[]`, so
 * the arithmetic that turns sightings into habits is untouched by it.
 */

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS sighting (
    at INTEGER PRIMARY KEY,
    place TEXT NOT NULL,
    via TEXT
  );
  CREATE INDEX IF NOT EXISTS sighting_place ON sighting (place, at);
`;

type Row = { at: number; place: string; via: string | null };

export type SeenStore = {
  /** the newest `limit` rows, oldest-first, which is the order every reader assumes */
  all: (limit: number) => Promise<Seen[]>;
  /** an inclusive window by time, for figures that want a year rather than a fortnight */
  between: (from: number, to: number) => Promise<Seen[]>;
  /** write rows; a moment already held is left alone */
  put: (rows: Seen[]) => Promise<void>;
  /** disown these moments — a sighting the app turned out to be wrong about */
  drop: (ats: number[]) => Promise<void>;
  /** empty it, paired with location sharing going off */
  clear: () => Promise<void>;
  /** how many rows, for a diagnostic that has to say so */
  held: () => Promise<number>;
  /** the earliest moment held, or null */
  oldest: () => Promise<number | null>;
};

const asSeen = (r: Row): Seen =>
  r.via === 'enter' || r.via === 'exit'
    ? { place: r.place, at: r.at, via: r.via }
    : // the key is absent rather than undefined: `via` is tested for truthiness all
      // over this codebase, and an explicit undefined round-trips differently
      { place: r.place, at: r.at };

export async function openSeenStore(name = 'jarvis-sightings.db'): Promise<SeenStore> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync(SCHEMA);

  return {
    async all(limit) {
      // newest by the cap, then reversed: a cap that took the oldest rows would be a
      // window into the wrong end of the history
      const rows = (await db.getAllAsync(
        'SELECT at, place, via FROM sighting ORDER BY at DESC LIMIT ?',
        limit
      )) as Row[];
      return rows.map(asSeen).reverse();
    },

    async between(from, to) {
      const rows = (await db.getAllAsync(
        'SELECT at, place, via FROM sighting WHERE at >= ? AND at <= ? ORDER BY at ASC',
        from,
        to
      )) as Row[];
      return rows.map(asSeen);
    },

    async put(rows) {
      // the moment is the identity, so a repeated save costs nothing — which matters
      // because the callers hand over a window rather than a delta
      for (const r of rows) {
        await db.runAsync(
          'INSERT OR IGNORE INTO sighting (at, place, via) VALUES (?, ?, ?)',
          r.at,
          r.place,
          r.via ?? null
        );
      }
    },

    async drop(ats) {
      for (const at of ats) await db.runAsync('DELETE FROM sighting WHERE at = ?', at);
    },

    async clear() {
      await db.runAsync('DELETE FROM sighting');
    },

    async held() {
      const row = (await db.getFirstAsync('SELECT COUNT(*) AS n FROM sighting')) as
        | { n: number }
        | null;
      return row?.n ?? 0;
    },

    async oldest() {
      const row = (await db.getFirstAsync('SELECT MIN(at) AS at FROM sighting')) as
        | { at: number | null }
        | null;
      return row?.at ?? null;
    },
  };
}
