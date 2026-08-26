import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The same briefing, said differently.
 *
 * The leaving briefing is correct and it had become wallpaper. Two a day, every
 * weekday, in the same eleven words — "An umbrella, unless you've grown fond of
 * arriving wet" is a good line the first time and furniture by the fourth, and a
 * notification you have stopped reading is indistinguishable from one that never
 * arrived. That was already learned once here, from the opposite direction: silence
 * on a quiet morning read as the feature being broken (see `commute.ts`), so the
 * all-clear was given figures to carry. This is the same problem one step on.
 *
 * **What varies and what must not.** The figures never vary. They are measurements,
 * and a measurement phrased for novelty is a measurement you can no longer compare
 * with yesterday's. What varies is the remark after it, and the title.
 *
 * **Every variant keeps the actionable word.** Android truncates a body in the
 * shade, so `umbrella`, `jacket`, `Water` survive in all of them — the same reason
 * `commute.ts` puts the figure first. A rotation that dropped the instruction from
 * one variant in six would be a briefing that failed one morning in six, which is
 * worse than repetition.
 *
 * **Rotation, not randomness.** Random repeats; on a pool of six it shows the same
 * line twice in a row roughly one morning in six, which is the exact complaint this
 * exists to answer. A persisted cursor per slot spends the whole pool before any
 * line comes round again, and it is deterministic, so a test can assert the
 * sequence rather than sampling it. The cursor is shared across departures on
 * purpose: leaving home and leaving the office are the two messages most likely to
 * be compared, since they arrive the same day.
 */

/** Where the cursors live. One small object, written once per briefing. */
const CURSOR_KEY = 'jarvis_briefing_voice';

/**
 * The lines, by slot.
 *
 * The voice rules are `commute.ts`'s and they are load-bearing — the four are
 * written out there. Two of them constrain every line in this file and are asserted
 * over the whole table in `briefingVoice.test.ts` rather than trusted: **no
 * exclamation marks**, and **no `sir`** anywhere in a remark, because the title
 * spends the one the message is allowed.
 */
export const REMARKS = {
  /**
   * Thunder. The only slot whose advice is about timing rather than what to carry,
   * so the instruction that must survive is the choice between the two.
   */
  storm: [
    'Leave early or wait it out — either beats the alternative.',
    'Leave early or wait it out. Standing under it is not the third option.',
    'Leave early or wait it out; the middle course is the one that soaks you.',
    'Leave early or wait it out. I have no preference, and the sky has one.',
    'Leave early or wait it out — both are decisions, unlike the usual approach.',
    'Leave early or wait it out. Either is fine. Neither is optional.',
  ],
  rain: [
    "An umbrella, unless you've grown fond of arriving wet.",
    'An umbrella. It is by the door, where it has been all week.',
    'An umbrella would be the sensible half of this conversation.',
    'Take the umbrella. I shall not raise it again until tomorrow.',
    'An umbrella, or a convincing account of yourself on arrival.',
    'An umbrella exists for precisely this forecast. Yours, specifically.',
    'The umbrella, then. I did ask.',
  ],
  hot: [
    'Water, and something for your head — I would rather not arrange the hospital visit.',
    'Water, and something for your head. Heatstroke is a poor look on anyone.',
    'Water, and something for your head, before the afternoon makes the case itself.',
    'Water, and something for your head. The sun is not negotiating today.',
    'Water, and something for your head — the alternative is a very dull evening.',
    'Water, and something for your head. Consider it a formality you will be glad of.',
  ],
  cold: [
    'The jacket you keep ignoring would be appropriate.',
    'The jacket. The one you own and decline to wear.',
    'A jacket, and I will pretend this is the first time I have suggested it.',
    'The jacket would be sensible, which is presumably why it is still indoors.',
    'A jacket. Shivering is not a personality.',
    'The jacket, sooner than the point at which you agree with me.',
  ],
  wind: [
    'Mind the hair.',
    'Mind the hair. It will not survive the argument.',
    'Mind the hair, and anything else you are fond of holding.',
    'Mind the hair. Today it is a gesture rather than a plan.',
    'Mind the hair — the wind has its own arrangement in mind.',
    'Mind the hair, and hold on to whatever is loose.',
  ],
  /**
   * The tail of a quiet briefing.
   *
   * The figures are already in the body and the point is made; this is the only
   * line in the table with no instruction in it, because there is nothing to carry.
   */
  clear: [
    'Do try to enjoy it.',
    'A rare morning with nothing to argue about.',
    'Nothing further from me. Go on.',
    'Unremarkable, in the best available sense.',
    'I have nothing to add, which is itself a small event.',
    'Enjoy the absence of my advice.',
  ],
} as const;

export type Slot = keyof typeof REMARKS;

/**
 * The titles, which carry the label and spend the message's one `sir`.
 *
 * Named in every variant, because two of these arrive in a day and a shade holding
 * both has to say which door each one is about — that was the original reason the
 * label went in the title and it survives every rewording here.
 */
export const TITLES = {
  warn: [
    (label: string) => `Before you leave ${label}, sir`,
    (label: string) => `A word before you leave ${label}, sir`,
    (label: string) => `${label}, and one thing to take with you, sir`,
    (label: string) => `On your way out of ${label}, sir`,
    (label: string) => `Leaving ${label}? A moment, sir`,
    (label: string) => `Before ${label} is behind you, sir`,
  ],
  clear: [
    (label: string) => `Nothing in your way from ${label}, sir`,
    (label: string) => `${label} to anywhere, unobstructed, sir`,
    (label: string) => `Clear run from ${label}, sir`,
    (label: string) => `No obstacles leaving ${label}, sir`,
    (label: string) => `${label} looks agreeable, sir`,
    (label: string) => `Nothing to report on leaving ${label}, sir`,
  ],
} as const;

export type TitleKind = keyof typeof TITLES;

type Cursors = Record<string, number>;

/**
 * A briefing's worth of lines, drawn in order and written back once.
 *
 * Deliberately not one storage read per line. A headless task's budget is the
 * scarcest thing this feature has — the journal was reordered behind the briefing
 * for exactly that reason (`commuteTask.ts`) — so the cursors are read once,
 * advanced in memory, and committed in a single write at the end.
 */
export type Voice = {
  /** The next remark for a slot. Advances that slot's cursor. */
  remark: (slot: Slot) => string;
  /** The next title of a kind, with the place named. Advances that kind's cursor. */
  title: (kind: TitleKind, label: string) => string;
  /**
   * Persist what was drawn.
   *
   * Never throws. A cursor that fails to save costs one repeated line; a briefing
   * that fails to arrive costs the morning, and this is not allowed to be the
   * reason for the second.
   */
  commit: () => Promise<void>;
};

/**
 * Read the cursors and hand back a drawing session.
 *
 * A missing or unparseable store is not an error: it is the first briefing, or a
 * cleared app, and starting from zero is exactly right in both cases.
 */
export async function openVoice(): Promise<Voice> {
  let stored: Cursors = {};
  try {
    const raw = await AsyncStorage.getItem(CURSOR_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') stored = parsed as Cursors;
  } catch {
    // a corrupt store rotates from the beginning rather than failing the briefing
  }
  return voiceFrom(stored);
}

/**
 * The session itself, over a plain object of cursors.
 *
 * Separated from storage so the rotation can be tested without a mock: this is
 * where "the pool is spent before a line returns" is actually true or not.
 */
export function voiceFrom(stored: Cursors): Voice {
  const at: Cursors = { ...stored };

  /**
   * The pool depth is passed in rather than looked up from the key.
   *
   * It was derived from the key at first, and the title cursors are stored under
   * `title:warn` so that lookup found nothing and indexed `undefined` — the sort of
   * mistake that only shows up as `undefined` on a lock screen. The caller already
   * holds the array; asking it for the length is one fewer thing to keep in step.
   */
  const take = (key: string, n: number): number => {
    // a stored cursor that is not a usable number starts the slot over rather than
    // producing `NaN`, which would index nothing and print `undefined` on a lock screen
    const raw = at[key];
    const cur = Number.isInteger(raw) && raw >= 0 ? raw : 0;
    at[key] = (cur + 1) % n;
    return cur % n;
  };

  return {
    remark: (slot) => REMARKS[slot][take(slot, REMARKS[slot].length)],
    title: (kind, label) => TITLES[kind][take(`title:${kind}`, TITLES[kind].length)](label),
    commit: async () => {
      try {
        await AsyncStorage.setItem(CURSOR_KEY, JSON.stringify(at));
      } catch {
        // one repeated line is a smaller failure than a briefing that did not arrive
      }
    },
  };
}
