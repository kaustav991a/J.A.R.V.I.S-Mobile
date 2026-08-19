import * as SQLite from 'expo-sqlite';

/**
 * The local journal: what this phone has observed about its own use.
 *
 * Every SQL statement in the app lives in this file. Nothing above it writes a
 * query, so the schema can change without a search across screens — and the
 * pieces that will read this later (recall, patterns, anticipation) all sit on
 * this one surface.
 *
 * The store is the phone's, and it stays the phone's. Raw rows never leave the
 * device; what travels is a summary computed here, which is the same shape the
 * ask envelope already uses for location.
 */

export type EventKind = 'foreground' | 'background' | 'screen_on' | 'screen_off' | 'unlock';

/** a precise moment. Android keeps roughly seven days of these */
export type UsageEvent = { at: number; kind: EventKind; app: string | null };

/** a coarse per-day total. Android keeps these for up to two years */
export type DailyRow = { day: string; app: string; ms: number };

/**
 * Two years, matching the longest window Android will serve.
 *
 * Bounded rather than tight: an event row is tens of bytes and a heavy day is a
 * few hundred rows, so a year sits comfortably under 10 MB. The cap exists so
 * the file cannot grow without limit on a phone that is never reinstalled.
 */
export const RETENTION_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  at   INTEGER NOT NULL,
  kind TEXT    NOT NULL,
  -- '' rather than NULL for the events that belong to no app, and NOT NULL to
  -- keep it that way. SQLite treats two NULLs as DISTINCT inside a primary key,
  -- so a nullable column here silently defeated the whole point of the key:
  -- unlocks and screen events re-inserted on every overlapping sync, one copy
  -- per run, forever. The empty string collides with itself the way a key must.
  app  TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (at, kind, app)
);
CREATE INDEX IF NOT EXISTS events_at ON events (at);
CREATE TABLE IF NOT EXISTS daily (
  day TEXT    NOT NULL,
  app TEXT    NOT NULL,
  ms  INTEGER NOT NULL,
  PRIMARY KEY (day, app)
);
CREATE TABLE IF NOT EXISTS sync (source TEXT PRIMARY KEY, through INTEGER NOT NULL);
`;

export type Journal = {
  putEvents(rows: UsageEvent[]): Promise<number>;
  putDaily(rows: DailyRow[]): Promise<number>;
  eventsBetween(from: number, to: number): Promise<UsageEvent[]>;
  dailyFor(day: string): Promise<DailyRow[]>;
  watermark(source: string): Promise<number | null>;
  setWatermark(source: string, through: number): Promise<void>;
  prune(now: number): Promise<number>;
  size(): Promise<{ events: number; daily: number }>;
};

export async function openJournal(name = 'jarvis-journal.db'): Promise<Journal> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync(SCHEMA);

  return {
    /**
     * Returns how many rows were genuinely new.
     *
     * `INSERT OR IGNORE` against the composite key, because collection windows
     * overlap deliberately: a sync asks for slightly before its watermark so an
     * event on the boundary is never dropped between runs, and that is only
     * safe when writing the same event twice costs nothing.
     *
     * `app` is normalised to '' on the way in and back to null on the way out.
     * The column cannot be nullable — see the schema — and callers should not
     * have to know that, so the translation lives here and nowhere else.
     */
    async putEvents(rows) {
      let written = 0;
      for (const r of rows) {
        const res = await db.runAsync(
          'INSERT OR IGNORE INTO events (at, kind, app) VALUES (?, ?, ?)',
          r.at,
          r.kind,
          r.app ?? ''
        );
        written += res.changes;
      }
      return written;
    },

    /**
     * The newest read of a day wins.
     *
     * A day still in progress is re-read on every sync and its total only ever
     * grows, so replacing is right and summing would double-count it.
     */
    async putDaily(rows) {
      let written = 0;
      for (const r of rows) {
        const res = await db.runAsync(
          `INSERT INTO daily (day, app, ms) VALUES (?, ?, ?)
           ON CONFLICT (day, app) DO UPDATE SET ms = excluded.ms`,
          r.day,
          r.app,
          r.ms
        );
        written += res.changes;
      }
      return written;
    },

    async eventsBetween(from, to) {
      const rows = (await db.getAllAsync(
        'SELECT at, kind, app FROM events WHERE at >= ? AND at <= ? ORDER BY at ASC',
        from,
        to
      )) as { at: number; kind: EventKind; app: string }[];
      // the '' sentinel is a storage detail; above this line an event that
      // belongs to no app has no app
      return rows.map((r) => ({ ...r, app: r.app === '' ? null : r.app }));
    },

    async dailyFor(day) {
      return (await db.getAllAsync(
        'SELECT day, app, ms FROM daily WHERE day = ? ORDER BY ms DESC',
        day
      )) as DailyRow[];
    },

    async watermark(source) {
      const row = (await db.getFirstAsync('SELECT through FROM sync WHERE source = ?', source)) as
        | { through: number }
        | null;
      return row ? row.through : null;
    },

    async setWatermark(source, through) {
      await db.runAsync(
        `INSERT INTO sync (source, through) VALUES (?, ?)
         ON CONFLICT (source) DO UPDATE SET through = excluded.through`,
        source,
        through
      );
    },

    async prune(now) {
      const res = await db.runAsync('DELETE FROM events WHERE at < ?', now - RETENTION_MS);
      return res.changes;
    },

    async size() {
      const e = (await db.getFirstAsync('SELECT COUNT(*) AS n FROM events')) as { n: number };
      const d = (await db.getFirstAsync('SELECT COUNT(*) AS n FROM daily')) as { n: number };
      return { events: e.n, daily: d.n };
    },
  };
}
