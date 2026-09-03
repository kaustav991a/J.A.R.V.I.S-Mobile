import * as SQLite from 'expo-sqlite';

import type { ChatEntry } from './hudReducer';

/**
 * The conversation kept past the window the phone renders.
 *
 * `CHAT_CAP` is 100, which is about a day at real conversation pace, so the phone
 * forgot a Tuesday on Wednesday while the desk kept it. **The cap was never the
 * problem** — a phone should not render an unbounded list — losing the turn was.
 *
 * SQLite rather than another JSON blob, and the reason is the reading rather than the
 * writing: months of chat in one key means parsing the lot to show yesterday. A table
 * pages, and the journal already carries `expo-sqlite`, so this costs no dependency.
 *
 * The AsyncStorage log stays exactly as it was. It is the fast path that hydrates the
 * app at launch, and a second store that has to be read before the first turn appears
 * would be a worse app for a feature almost nobody uses every day.
 */

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS chat (
    at INTEGER PRIMARY KEY,
    who TEXT NOT NULL,
    text TEXT NOT NULL,
    image TEXT
  );
`;

type Row = { at: number; who: string; text: string; image: string | null };

export type Archive = {
  /** keep these turns; one already held is left alone */
  archive: (entries: ChatEntry[]) => Promise<void>;
  /** a page of turns from before `at`, oldest first so it can be prepended */
  olderThan: (at: number, limit: number) => Promise<ChatEntry[]>;
  /** how many turns are held, for a row that has to say so */
  held: () => Promise<number>;
  /** take one out, the way a turn can be removed from the log */
  forget: (at: number) => Promise<void>;
  /** empty it — paired with clearing the log itself */
  forgetAll: () => Promise<void>;
};

const asEntry = (r: Row): ChatEntry => ({
  from: r.who === 'jarvis' ? 'jarvis' : 'user',
  text: r.text,
  at: r.at,
  ...(r.image ? { image: r.image } : {}),
});

export async function openArchive(name: string = 'jarvis-chat.db'): Promise<Archive> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync(SCHEMA);

  return {
    async archive(entries) {
      // INSERT OR IGNORE on the timestamp: `saveChat` hands over the whole window on
      // every change, so the archive sees the same hundred turns again and again and
      // must treat that as free rather than as a hundred writes
      for (const e of entries) {
        await db.runAsync(
          'INSERT OR IGNORE INTO chat (at, who, text, image) VALUES (?, ?, ?, ?)',
          e.at,
          e.from,
          e.text,
          e.image ?? null
        );
      }
    },

    async olderThan(at, limit) {
      // newest of the older ones, then reversed: the page wanted is the one that sits
      // immediately above what is on screen, not the oldest turns in the archive
      const rows = (await db.getAllAsync(
        'SELECT at, who, text, image FROM chat WHERE at < ? ORDER BY at DESC LIMIT ?',
        at,
        limit
      )) as Row[];
      return rows.map(asEntry).reverse();
    },

    async held() {
      const row = (await db.getFirstAsync('SELECT COUNT(*) AS n FROM chat')) as { n: number } | null;
      return row?.n ?? 0;
    },

    async forget(at) {
      await db.runAsync('DELETE FROM chat WHERE at = ?', at);
    },

    async forgetAll() {
      await db.runAsync('DELETE FROM chat');
    },
  };
}
