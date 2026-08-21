import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which timeline entries have been seen, kept across launches.
 *
 * The Activity panel held one timestamp, baselined at mount, so "read" meant
 * "older than this launch". That answered the bell's question — is there anything
 * new — and could not answer the panel's: which of these have I actually looked
 * at. Reading one entry said nothing about its neighbours, and nothing survived a
 * restart, so every relaunch re-marked the whole log unread and the number on the
 * bell became something you learn to ignore.
 *
 * A set of ids is the smaller claim and the honest one: this entry, seen.
 *
 * `AsyncStorage` and one JSON blob, for the same reasons as `chatStore`: this is a
 * few hundred short strings rather than a secret, the whole set is read at launch
 * and written on change, and a single key cannot half-exist the way a set of them
 * can.
 */
const KEY = 'jarvis_activity_read';

/**
 * How many ids survive.
 *
 * Above `CHAT_KEEP` on purpose, because the timeline is chat plus trace and the
 * trace half is not persisted at all — its ids die with the process, so they cost
 * this key nothing after a restart. Past the cap an entry can never be rendered
 * again, so remembering it read would grow the file forever for nothing.
 */
export const READ_KEEP = 300;

/**
 * The stored set, or an empty one.
 *
 * Every entry is checked rather than the array being trusted wholesale: this file
 * outlives the code that wrote it. A single bad entry is dropped; it does not cost
 * the rest, and it never reaches the provider typed as something it is not.
 */
export async function loadRead(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(-READ_KEEP);
  } catch {
    // unreadable storage is not worth taking the app down for; at worst the panel
    // shows a few things as unread that were already seen
    return [];
  }
}

export async function saveRead(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(ids.slice(-READ_KEEP)));
  } catch {
    // a set that cannot be written still works for this session
  }
}
