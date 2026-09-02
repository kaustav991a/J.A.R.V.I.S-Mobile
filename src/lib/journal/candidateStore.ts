import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The sentences you have already answered about.
 *
 * A candidate you kept is a fact he holds now; one you dismissed is a no. **Both are
 * answers, and they are stored the same way on purpose** — what the offer needs to
 * know is that the question was asked and settled, not which way it went. Keeping
 * them apart would mean the screen could re-ask a dismissal on some future rule
 * change, which is exactly the behaviour that gets a feature switched off.
 *
 * Ids only, never the sentence. A dismissed secret should not survive its dismissal in
 * a second store, and `factId` is lossy enough that this file holds no text worth
 * reading — see the SECRET guard in `candidates.ts` for why that matters.
 */

const KEY = 'jarvis_fact_decided';

/** every sentence already kept or dismissed */
export async function decidedIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    // an unreadable ledger costs a repeated question, which is better than a
    // Memory screen that will not open
    return [];
  }
}

/** mark a sentence answered, whichever answer it got */
export async function noteDecided(id: string): Promise<void> {
  try {
    const held = await decidedIds();
    if (held.includes(id)) return;
    await AsyncStorage.setItem(KEY, JSON.stringify([...held, id]));
  } catch {
    /* the offer coming back is the whole cost */
  }
}

/**
 * Empty it, which is the only way back for a dismissal.
 *
 * Dismissing is permanent by design — an offer that returns after a no is nagging —
 * so without this there would be no way to change your mind short of reinstalling.
 */
export async function forgetDecided(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}
