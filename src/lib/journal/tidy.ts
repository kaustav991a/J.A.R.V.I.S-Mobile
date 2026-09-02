import { factId } from './candidates';
import { noteDecided } from './candidateStore';
import type { Stale } from './stale';

/**
 * Acting on a fact he offered to forget.
 *
 * The mirror of `decide.ts`, and it makes the mirror promise: **nothing is deleted
 * until it is ticked.** A memory that empties itself is worse than one that fills up,
 * because filling up is visible on the screen and emptying is not.
 */

export type ForgetResult = { ok: true; facts: string[] } | { ok: false; why: string };

/** drop it at the gateway, which is where the facts actually live */
export async function forgetOne(
  stale: Stale,
  deps: { forget: (fact: string) => Promise<{ facts: string[] }> }
): Promise<ForgetResult> {
  try {
    const out = await deps.forget(stale.fact);
    return { ok: true, facts: out.facts };
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : 'could not forget that' };
  }
}

/**
 * Keep one he offered to drop, and stop offering it.
 *
 * Prefixed so a fact kept here cannot be confused with a sentence kept on the other
 * side — one ledger, two questions, and answering *"do not remember this"* must never
 * silence *"forget this"* about the same words.
 */
export async function keepAnyway(stale: Stale): Promise<void> {
  await noteDecided(`keep:${factId(stale.fact)}`);
}
