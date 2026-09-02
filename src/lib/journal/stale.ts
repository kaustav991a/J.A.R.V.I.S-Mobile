/**
 * Facts worth forgetting, offered the way facts worth keeping are.
 *
 * **The complaint that produced this, 2026-09-02:** *"all that i tell him will go to
 * the memory ?? thats not feasable"*. Nineteen facts on the phone by then, and several
 * were never facts about a life — *"Kaustav asked about Marco Polo"* is a question
 * somebody asked once, *"Kaustav is currently in Ichapur"* is true for an hour. The
 * Memory screen states the cost itself: every one of them rides along on every reply.
 *
 * **This proposes; it never deletes.** The same shape as the keeping side, and for the
 * same reason — a memory that empties itself is worse than one that fills up, because
 * the second is visible and the first is not.
 */

export type Stale = {
  /** the fact, exactly as it is stored */
  fact: string;
  /** why it is being offered up, which is what makes this a decision rather than a purge */
  why: string;
};

/**
 * Things that were true when they were written and are not standing facts.
 *
 * A question asked once, a place somebody is *currently* in, anything anchored to a
 * day. The phone measures where you are far better than a sentence can, and a
 * sentence that says *today* is wrong by tomorrow.
 */
const TRANSIENT: { test: RegExp; why: string }[] = [
  {
    test: /\basked (about|for|whether|if)\b|\bwanted to know\b|\bwas asking\b/i,
    why: 'A question asked once, rather than something true about you.',
  },
  {
    test: /\b(is|was) (currently|presently|right now)\b|\bis at the moment\b/i,
    why: 'Where you are moves, and the phone measures it better than a sentence can.',
  },
  {
    test: /\b(today|tonight|this morning|this afternoon|this evening|this week|right now|just now|yesterday|tomorrow)\b/i,
    why: 'Anchored to a day, so it is wrong by tomorrow.',
  },
];

/** words that carry no signal when deciding whether two sentences say the same thing */
const NOISE = new Set([
  'a', 'an', 'and', 'at', 'be', 'by', 'called', 'for', 'from', 'has', 'have', 'he',
  'her', 'his', 'in', 'is', 'it', 'its', 'my', 'named', 'of', 'on', 'or', 'she',
  'that', 'the', 'their', 'they', 'to', 'was', 'were', 'with', 'you', 'your',
]);

const words = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !NOISE.has(w))
  );

/**
 * Whether two facts are the same claim wearing different words.
 *
 * Measured on the words that carry meaning, with the connective tissue thrown away:
 * *"Kaustav's manager at Fortmindz is called Rahul"* and *"my manager is called
 * Rahul"* share `manager` and `rahul` out of two and three. **Two facts that merely
 * mention the same person do not** — *dog Kitty* and *dog Puku* share only `dog`.
 */
/**
 * The names in a sentence, which are what two similar sentences disagree about.
 *
 * *"Kaustav has a dog called Kitty"* and *"Kaustav had a dog called Puku"* overlap on
 * almost every word that carries meaning — dog, Kaustav — and are about two different
 * animals. The names are the whole difference, and a rule that cannot see them will
 * offer to forget a dead dog because a living one resembles him.
 */
const names = (text: string): Set<string> => {
  // the first word is skipped rather than excluded by a lookahead. Every sentence
  // starts with a capital, and `(?!^)` matched nothing at all once compiled here —
  // an afternoon on 2026-09-02 went into finding that, so this stays boring.
  const [, ...rest] = text
    .replace(/[^A-Za-z\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return new Set(rest.filter((w) => /^[A-Z][a-z]{2,}$/.test(w)).map((w) => w.toLowerCase()));
};

const sameClaim = (a: string, b: string): boolean => {
  // a name each side does not share is two claims about two different things, however
  // alike the rest of the sentence reads
  const left = names(a);
  const right = names(b);
  const leftOnly = [...left].some((n) => !right.has(n));
  const rightOnly = [...right].some((n) => !left.has(n));
  if (leftOnly && rightOnly) return false;

  const one = words(a);
  const two = words(b);
  const smaller = one.size <= two.size ? one : two;
  if (smaller.size === 0) return false;
  let shared = 0;
  for (const w of smaller) if ((smaller === one ? two : one).has(w)) shared += 1;
  return shared / smaller.size >= 0.6;
};

/**
 * What he would offer to forget, in the order the facts are held.
 *
 * A duplicate proposes the LATER of the pair: the earlier one is what he has been
 * answering from, and the newer is the one that arrived while nobody was looking.
 */
export function staleFacts(facts: string[]): Stale[] {
  const out: Stale[] = [];

  facts.forEach((fact, i) => {
    const transient = TRANSIENT.find((t) => t.test.test(fact));
    if (transient) {
      out.push({ fact, why: transient.why });
      return;
    }

    const twin = facts.slice(0, i).find((earlier) => sameClaim(earlier, fact));
    if (twin) {
      out.push({ fact, why: `He already knows this — it says the same as "${twin}".` });
    }
  });

  return out;
}
