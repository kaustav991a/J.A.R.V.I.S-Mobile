import type { Candidate } from './candidates';
import { noteDecided } from './candidateStore';

/**
 * The two answers to an offered sentence.
 *
 * The whole design rests on one promise — **nothing reaches the gateway until it is
 * ticked** — and that promise lives here rather than in the screen, so it can be
 * tested without rendering anything. The screen's only job is to call the right one.
 */

export type Remembered = { facts: string[]; persistent: boolean; stored: boolean };

export type KeepResult =
  | { ok: true; stored: boolean; facts: string[] }
  | { ok: false; why: string };

/**
 * Keep one, by the same path a fact typed by hand takes.
 *
 * **Marked answered only after the gateway has it.** A candidate marked on a failed
 * send is a sentence nobody can recover: the chat may roll past it before the network
 * comes back, and the offer would never return. Losing the send is recoverable;
 * losing the sentence is not.
 */
export async function keepFact(
  candidate: Candidate,
  deps: { remember: (said: string) => Promise<Remembered> }
): Promise<KeepResult> {
  try {
    // the text as it was said, not the normalised id: the id is lossy on purpose, and
    // what he remembers should read like the person who said it
    const out = await deps.remember(candidate.text);
    await noteDecided(candidate.id);
    return { ok: true, stored: out.stored, facts: out.facts };
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : 'could not save that' };
  }
}

/**
 * Refuse one, permanently.
 *
 * Nothing is sent anywhere. The id is written so the sentence is never offered again —
 * an offer that comes back after a no is nagging, and nagging is how a feature like
 * this gets switched off for good.
 */
export async function dismissFact(candidate: Candidate): Promise<void> {
  await noteDecided(candidate.id);
}
