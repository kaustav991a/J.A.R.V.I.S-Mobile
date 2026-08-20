/**
 * How a reply arrives on screen: in pieces, at the pace of someone speaking.
 *
 * Answers used to appear whole, which reads as a network response landing rather
 * than as anyone answering. This is the closest thing to a voice the app can have
 * before it has one, and it is what makes the real voice drop in later rather
 * than replace anything — the cadence is already here for it to follow.
 *
 * **Words, not characters.** A character-by-character reveal reads as a machine
 * printing; the existing `TypeLine` does that and is right for a one-line splash.
 * Words read as someone speaking, and cost roughly a fifth of the renders.
 *
 * **The whole reveal is budgeted, not the step.** A 300-word answer at a
 * sentence's pace would take half a minute of watching, and the second time that
 * happened it would be asked for as a setting to turn off. So a long reply is
 * revealed in bigger pieces rather than over more time.
 *
 * The arithmetic lives here, away from React, because the interesting part is
 * arithmetic and the interesting bugs are off-by-one.
 */

/** the most pieces any reply is broken into, however long it is */
const MAX_STEPS = 40;
/** ms per piece — the pace a sentence reads at */
const STEP_MS = 55;
/** the whole reveal must finish inside this, whatever the length */
const BUDGET_MS = 2200;

/**
 * The successive prefixes a reply is shown as, ending on the whole thing.
 *
 * Whitespace is preserved rather than normalised, and that matters: `rich.ts`
 * reads a newline as the end of a bullet, so collapsing them would render the
 * list as prose halfway through the reveal and then snap it into shape at the
 * end — the one thing more distracting than no reveal at all.
 */
export function revealSteps(text: string): string[] {
  const src = text ?? '';
  if (!src.trim()) return [];

  // split on the whitespace, keeping it, so each piece carries its own separator
  const parts = src.match(/\S+\s*/g) ?? [];
  // A single word is not paced. A lone "Yes." blinking into place looks like a
  // glitch rather than a flourish, and there is nothing to reveal.
  if (parts.length <= 1) return [src];

  // Bigger pieces rather than more of them, once a reply is long. Ceil so the
  // last piece is never empty and the count never exceeds MAX_STEPS.
  const perStep = Math.max(1, Math.ceil(parts.length / MAX_STEPS));

  const steps: string[] = [];
  for (let i = perStep; i < parts.length; i += perStep) {
    steps.push(parts.slice(0, i).join(''));
  }
  // The last step is the source itself, not a re-join: `match` drops nothing here,
  // but ending on the original string means a reveal can never alter what was
  // said, whatever the splitting does.
  steps.push(src);
  return steps;
}

/**
 * How long to wait between pieces, given how many there are.
 *
 * Reads as a pace for short answers and stays inside the budget for long ones.
 */
export function stepFor(steps: number): number {
  if (steps <= 1) return STEP_MS;
  return Math.max(20, Math.min(STEP_MS, Math.floor(BUDGET_MS / steps)));
}
