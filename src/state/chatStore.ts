import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatEntry } from './hudReducer';

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
    return parsed.filter(isEntry).slice(-CHAT_KEEP);
  } catch {
    // unreadable storage is not worth taking the app down for; the log restarts
    return [];
  }
}

export async function saveChat(chat: ChatEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(chat.slice(-CHAT_KEEP)));
  } catch {
    // a log that cannot be written still works for this session
  }
}

/** forget the conversation — the only way back from a log you do not want kept */
export async function clearChat(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // nothing stored is the state we wanted anyway
  }
}
