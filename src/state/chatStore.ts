import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatEntry } from './hudReducer';
import { openArchive } from './chatArchive';
import type { Archive } from './chatArchive';

/**
 * The conversation, kept across launches.
 *
 * `AsyncStorage` rather than `SecureStore`: this is a hundred lines of chat, not a
 * secret, and SecureStore is a keychain — it warns past a couple of kilobytes and
 * is the wrong tool for bulk. Nothing here is sensitive enough to want encryption
 * at rest that the rest of the app cannot read.
 *
 * One JSON blob rather than a row per turn. The whole log is read at launch and
 * written on change, so there is nothing to gain from addressing turns
 * individually, and a single key cannot half-exist the way a set of them can.
 */
const KEY = 'jarvis_chat_log';

/**
 * How much survives. The same number the reducer caps at in memory, deliberately:
 * two caps that can disagree is a bug waiting to be reported as "it forgot some".
 */
export const CHAT_KEEP = 100;

const isEntry = (v: unknown): v is ChatEntry => {
  if (v === null || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    (e.from === 'jarvis' || e.from === 'user') &&
    typeof e.text === 'string' &&
    typeof e.at === 'number' &&
    Number.isFinite(e.at)
  );
};

/**
 * Read the stored log, or an empty one.
 *
 * Every entry is checked rather than the array being trusted wholesale: this file
 * outlives the code that wrote it, so a shape from an older build has to be
 * survivable. A single bad entry is dropped; it does not cost the whole history,
 * and it never reaches the reducer typed as something it is not.
 */
export async function loadChat(): Promise<ChatEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const held = parsed.filter(isEntry).slice(-CHAT_KEEP);

    /**
     * Backfilled at launch, not only on the next save.
     *
     * The archive arrived on 2026-09-03 over a log that was already months old, and
     * `saveChat` only runs when something changes — so an app opened and closed without
     * a word would have archived nothing while a hundred turns sat in AsyncStorage.
     * Fire and forget: the log is returned either way, and the long memory catching up
     * is never a reason to make somebody wait for their conversation.
     */
    void theArchive()
      .then((kept) => kept?.archive(held))
      .catch(() => undefined);

    return held;
  } catch {
    // unreadable storage is not worth taking the app down for; the log restarts
    return [];
  }
}

/**
 * The archive, opened once and kept.
 *
 * Held rather than opened per call: `saveChat` runs on every change, and opening a
 * database four hundred milliseconds apart all day would be a cost paid for nothing.
 * A failure to open is remembered as null so the log still saves — the archive is the
 * long memory, and the window is the one somebody is looking at.
 */
let archive: Archive | null = null;
let opening: Promise<Archive | null> | null = null;

const theArchive = async (): Promise<Archive | null> => {
  if (archive) return archive;
  if (!opening) {
    opening = openArchive()
      .then((a) => {
        archive = a;
        return a;
      })
      .catch(() => null);
  }
  return opening;
};

/** for tests and for the switch that forgets the conversation */
export const useArchive = (a: Archive | null): void => {
  archive = a;
  opening = a ? Promise.resolve(a) : null;
};

export async function saveChat(chat: ChatEntry[]): Promise<void> {
  try {
    // archived BEFORE the slice, because the slice is where a turn is lost: the
    // window keeps the last hundred and the archive keeps the conversation
    const kept = await theArchive();
    if (kept) await kept.archive(chat);
  } catch {
    // the long memory failing must never cost the short one
  }
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(chat.slice(-CHAT_KEEP)));
  } catch {
    // a log that cannot be written still works for this session
  }
}

/** how many turns come back per tap of "load earlier" */
export const EARLIER_PAGE = 50;

/**
 * A page of conversation from before a moment.
 *
 * The screen's way into the archive, kept here so the screen holds no database
 * knowledge and so the paging is testable without rendering anything.
 */
export async function earlierThan(at: number, limit: number = EARLIER_PAGE): Promise<ChatEntry[]> {
  try {
    const kept = await theArchive();
    return kept ? await kept.olderThan(at, limit) : [];
  } catch {
    return [];
  }
}

/**
 * How many turns the archive is holding.
 *
 * A number somebody can watch. The archive is invisible by nature — it matters only
 * on the day you scroll back far enough to need it — and *"trust me, it is saving"* is
 * the shape of every bug this project has shipped. Watching this pass a hundred is
 * proof the long memory exists before anybody needs it.
 */
export async function heldTurns(): Promise<number> {
  try {
    const kept = await theArchive();
    return kept ? await kept.held() : 0;
  } catch {
    return 0;
  }
}

/** forget the conversation — the only way back from a log you do not want kept */
export async function clearChat(): Promise<void> {
  try {
    // both stores, and this is the point rather than tidiness: a log somebody asked
    // to forget must not survive in the one they cannot see
    const kept = await theArchive();
    if (kept) await kept.forgetAll();
  } catch {
    /* nothing archived, or nothing openable */
  }
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // nothing stored is the state we wanted anyway
  }
}
