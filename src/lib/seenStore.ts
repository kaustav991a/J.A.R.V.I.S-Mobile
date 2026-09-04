import AsyncStorage from '@react-native-async-storage/async-storage';
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

/**
 * The moment plus the place is the row's identity, not the moment alone.
 *
 * A sweep reports every region the phone is outside of, and on 2026-09-01 ten places
 * reported leaving inside the same minute — timestamps that can land on the identical
 * millisecond, because they come from one delivery. Keyed on `at` alone the table
 * would have silently kept one of the ten and the burst rule would have had nothing
 * left to recognise. The pair still dedupes what matters: the same crossing delivered
 * twice, which the platform does routinely.
 */
const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS sighting (
    at INTEGER NOT NULL,
    place TEXT NOT NULL,
    via TEXT,
    PRIMARY KEY (at, place)
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
  /**
   * Disown these rows, each named by the moment AND the place.
   *
   * The moment alone is not enough. A sweep delivers an arrival and several departures
   * on one clock reading — Office `enter`, Home `exit`, Sector V `exit`, all at 18:31
   * — and taking back the sweep by moment would have taken the real arrival with it.
   */
  drop: (rows: Array<{ at: number; place: string }>) => Promise<void>;
  /**
   * Write many rows in one transaction.
   *
   * `put` is a statement per row, which is right for one crossing and wrong for eight
   * thousand. An import is one transaction or it is a progress bar nobody asked for.
   */
  putMany: (rows: Seen[]) => Promise<void>;
  /** take every imported row back out, and say how many went */
  dropImported: () => Promise<number>;
  /** empty it, paired with location sharing going off */
  clear: () => Promise<void>;
  /** how many rows, for a diagnostic that has to say so */
  held: () => Promise<number>;
  /** the earliest moment held, or null */
  oldest: () => Promise<number | null>;
};

/**
 * The four kinds a stored `via` may be.
 *
 * Enumerated rather than cast, because the column outlives the code that wrote it and
 * a build from before 2026-09-04 knew nothing about imports. **Kept in step with
 * `Seen.via` by hand, and the day it fell out of step it cost an afternoon:** the
 * mapper allowed only `enter` and `exit`, so 8,000 imported rows were written
 * correctly and then read back with no `via` at all. The write worked and the read
 * threw the information away, which is the shape of nearly every bug in this project.
 */
const VIA = new Set(['enter', 'exit', 'import-enter', 'import-exit']);

const asSeen = (r: Row): Seen =>
  r.via !== null && VIA.has(r.via)
    ? { place: r.place, at: r.at, via: r.via as Seen['via'] }
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

    async drop(rows) {
      for (const r of rows) {
        await db.runAsync('DELETE FROM sighting WHERE at = ? AND place = ?', r.at, r.place);
      }
    },

    async putMany(rows) {
      await db.withTransactionAsync(async () => {
        for (const r of rows) {
          await db.runAsync(
            'INSERT OR IGNORE INTO sighting (at, place, via) VALUES (?, ?, ?)',
            r.at,
            r.place,
            r.via ?? null
          );
        }
      });
    },

    async dropImported() {
      const r = await db.runAsync("DELETE FROM sighting WHERE via LIKE 'import%'");
      return r.changes;
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

/** the blob's key, verbatim — it is not deleted, so the name has to stay exact */
const BLOB_KEY = 'jarvis_place_seen';
/** the marker that stops the move running a second time */
const MOVED_KEY = 'jarvis_place_seen_moved';

const isSeen = (v: unknown): v is Seen =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as Seen).place === 'string' &&
  Number.isFinite((v as Seen).at);

/**
 * Move the old AsyncStorage blob into the table, once.
 *
 * The blob is **kept**. It costs a few kilobytes and it is the only way back if this
 * migration is wrong — and a store holding twelve weeks of somebody's movements is not
 * where you want to discover that the hard way.
 *
 * Returns how many rows moved: 0 if it has already run, if there was nothing to move,
 * or if the blob could not be read at all. An unreadable blob is not worth crashing a
 * launch over; this file outlives the code that wrote it, so a shape from an older
 * build has to be survivable.
 */
export async function migrateOnce(store: SeenStore): Promise<number> {
  try {
    if (await AsyncStorage.getItem(MOVED_KEY)) return 0;
    const raw = await AsyncStorage.getItem(BLOB_KEY);
    if (!raw) {
      await AsyncStorage.setItem(MOVED_KEY, '1');
      return 0;
    }
    const parsed: unknown = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed.filter(isSeen) : [];
    await store.put(rows);
    await AsyncStorage.setItem(MOVED_KEY, '1');
    return rows.length;
  } catch {
    return 0;
  }
}
