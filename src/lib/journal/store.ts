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

/**
 * A coarse per-day total.
 *
 * Android keeps DAILY buckets for about a week — the two-year figure belongs to
 * its yearly aggregate, which is not per-day and is no use for a habit. So the
 * journal's real job is not to fetch history, it is to KEEP it: what is written
 * here survives long after the system has discarded its own copy.
 */
export type DailyRow = { day: string; app: string; ms: number };

/** one app's foreground time summed across a span of days */
export type DailyAppTotal = { app: string; ms: number };

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
-- what each package is actually called. Kept rather than looked up on every
-- read, so a history entry keeps its name after the app is uninstalled.
CREATE TABLE IF NOT EXISTS labels (app TEXT PRIMARY KEY, label TEXT NOT NULL);
`;

/**
 * Rows per statement.
 *
 * 200 × 3 columns is 600 bind variables, comfortably inside SQLite's limit
 * (999 on the older builds, 32,766 on current ones) with room for a fourth
 * column later. Large enough that a week of events is a few dozen statements
 * rather than tens of thousands.
 */
const CHUNK = 200;

/** `(?, ?, ?), (?, ?, ?), …` — one group per row */
const values = (rows: number, cols: number): string =>
  Array.from({ length: rows }, () => `(${Array.from({ length: cols }, () => '?').join(', ')})`).join(', ');

export type Journal = {
  putEvents(rows: UsageEvent[]): Promise<number>;
  putDaily(rows: DailyRow[]): Promise<number>;
  eventsBetween(from: number, to: number): Promise<UsageEvent[]>;
  dailyFor(day: string): Promise<DailyRow[]>;
  /** total foreground time per day across every app, oldest first */
  msByDay(from: string, to: string): Promise<{ day: string; ms: number }[]>;
  /** the heaviest apps across a span of days, not within one of them */
  appTotals(from: string, to: string, limit: number): Promise<DailyAppTotal[]>;
  /** just the timestamps of one kind — counting 17,000 events in JS to find 280 is not a plan */
  timesOfKind(kind: EventKind, from: number, to: number): Promise<number[]>;
  putLabels(map: Record<string, string>): Promise<void>;
  /** every package name this journal knows a real name for */
  allLabels(): Promise<Record<string, string>>;
  watermark(source: string): Promise<number | null>;
  setWatermark(source: string, through: number): Promise<void>;
  prune(now: number): Promise<number>;
  size(): Promise<{ events: number; daily: number }>;
};

/**
 * One connection per database, for the life of the process.
 *
 * Three things open the journal — the screen, the background task, and whatever
 * asks it a question — and each used to get its own connection to the same file.
 * Two connections mid-transaction on one SQLite file is how the device produced
 * `cannot start a transaction within a transaction`.
 *
 * `:memory:` is deliberately never cached: every test wants an empty database,
 * and handing the second caller the first one's rows would make the whole suite
 * agree with itself about nothing.
 */
const open = new Map<string, Promise<Journal>>();

export function openJournal(name = 'jarvis-journal.db'): Promise<Journal> {
  if (name === ':memory:') return build(name);
  const existing = open.get(name);
  if (existing) return existing;
  const fresh = build(name).catch((e: unknown) => {
    // a failed open must not be remembered as the connection
    open.delete(name);
    throw e;
  });
  open.set(name, fresh);
  return fresh;
}

async function build(name: string): Promise<Journal> {
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
      if (rows.length === 0) return 0;
      let written = 0;
      /**
       * One transaction, a few dozen statements, measured on the device.
       *
       * This was a bare `runAsync` per row, and a first sync — seven days of
       * events, tens of thousands of rows — was still crawling minutes later:
       * every call is a bridge round-trip AND its own implicit transaction, so
       * each row cost a commit and an fsync. The jest suite could never show it,
       * because in-process SQLite makes the same loop instant. The phone showed
       * it in about four minutes of watching a counter climb.
       *
       * The obvious repair — a prepared statement inside the transaction — hung
       * the device outright: the probe logged `permission: granted` and never
       * reached the next line, with the database left at 63 bytes. Multi-row
       * `VALUES` needs no prepared statement at all, and is fewer round-trips
       * than one anyway: a week of events becomes a few dozen statements.
       */
      await db.withTransactionAsync(async () => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          const slice = rows.slice(i, i + CHUNK);
          const res = await db.runAsync(
            `INSERT OR IGNORE INTO events (at, kind, app) VALUES ${values(slice.length, 3)}`,
            slice.flatMap((r) => [r.at, r.kind, r.app ?? ''])
          );
          written += res.changes;
        }
      });
      return written;
    },

    /**
     * The newest read of a day wins.
     *
     * A day still in progress is re-read on every sync and its total only ever
     * grows, so replacing is right and summing would double-count it.
     */
    async putDaily(rows) {
      if (rows.length === 0) return 0;
      let written = 0;
      // batched for the same reason as `putEvents`: a row per app per day is
      // still hundreds on a first run, and a commit each is what made that run
      // look like a hang
      await db.withTransactionAsync(async () => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          const slice = rows.slice(i, i + CHUNK);
          const res = await db.runAsync(
            `INSERT INTO daily (day, app, ms) VALUES ${values(slice.length, 3)}
             ON CONFLICT (day, app) DO UPDATE SET ms = excluded.ms`,
            slice.flatMap((r) => [r.day, r.app, r.ms])
          );
          written += res.changes;
        }
      });
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

    /**
     * Names are stored, not looked up on every read.
     *
     * `PackageManager` only knows about apps that are still installed, so
     * resolving at display time would silently rename a year of history to
     * `com.something` the day you uninstall it. Written once and kept.
     */
    async msByDay(from, to) {
      return (await db.getAllAsync(
        'SELECT day, SUM(ms) AS ms FROM daily WHERE day >= ? AND day <= ? GROUP BY day ORDER BY day ASC',
        from,
        to
      )) as { day: string; ms: number }[];
    },

    async appTotals(from, to, limit) {
      return (await db.getAllAsync(
        `SELECT app, SUM(ms) AS ms FROM daily WHERE day >= ? AND day <= ?
         GROUP BY app ORDER BY ms DESC LIMIT ?`,
        from,
        to,
        limit
      )) as DailyAppTotal[];
    },

    async timesOfKind(kind, from, to) {
      const rows = (await db.getAllAsync(
        'SELECT at FROM events WHERE kind = ? AND at >= ? AND at <= ? ORDER BY at ASC',
        kind,
        from,
        to
      )) as { at: number }[];
      return rows.map((r) => r.at);
    },

    async putLabels(map) {
      const rows = Object.entries(map);
      if (rows.length === 0) return;
      await db.withTransactionAsync(async () => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          const slice = rows.slice(i, i + CHUNK);
          await db.runAsync(
            `INSERT INTO labels (app, label) VALUES ${values(slice.length, 2)}
             ON CONFLICT (app) DO UPDATE SET label = excluded.label`,
            slice.flat()
          );
        }
      });
    },

    async allLabels() {
      const rows = (await db.getAllAsync('SELECT app, label FROM labels')) as {
        app: string;
        label: string;
      }[];
      return Object.fromEntries(rows.map((r) => [r.app, r.label]));
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
