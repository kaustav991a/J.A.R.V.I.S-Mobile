import { revealSteps, stepFor } from '../reveal';

/**
 * How a reply arrives on screen.
 *
 * Answers popped in whole, which reads as a network response landing rather than
 * as someone answering. This is the closest thing to a voice the app can have
 * before it has one — and it is deliberately WORD by word rather than character
 * by character: characters read as a machine printing, words read as someone
 * speaking, and it is roughly a fifth of the renders.
 *
 * The steps are computed here, away from React, because the interesting part is
 * arithmetic and the interesting bugs are off-by-one.
 */

describe('the steps a reply is revealed in', () => {
  it('ends on the whole reply, exactly', () => {
    const text = 'Quite so, sir. The desk is awake.';
    const steps = revealSteps(text);
    expect(steps[steps.length - 1]).toBe(text);
  });

  it('never shows a word it has not reached', () => {
    const text = 'One two three four';
    for (const step of revealSteps(text)) {
      expect(text.startsWith(step)).toBe(true);
    }
  });

  it('grows, never shrinks', () => {
    const steps = revealSteps('One two three four five six seven');
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i].length).toBeGreaterThan(steps[i - 1].length);
    }
  });

  /**
   * A long answer must not take a minute to read out. The cadence stretches for a
   * sentence and compresses for an essay, because the point is that it feels
   * spoken — not that every reply takes the same time per word.
   */
  it('reveals a long reply in no more steps than a readable number', () => {
    const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    expect(revealSteps(long).length).toBeLessThanOrEqual(60);
  });

  it('takes more than one step for anything worth revealing', () => {
    expect(revealSteps('The desk is awake, sir.').length).toBeGreaterThan(2);
  });

  /**
   * A one-word answer revealed in one step is just the answer. Anything that
   * cannot be paced should not be paced — a lone "Yes." blinking into place looks
   * like a glitch, not a flourish.
   */
  it('does not pace a single word', () => {
    expect(revealSteps('ACORN')).toEqual(['ACORN']);
    expect(revealSteps('')).toEqual([]);
    expect(revealSteps('   ')).toEqual([]);
  });

  /**
   * Whitespace is structure here, not padding: `rich.ts` reads a newline as the
   * end of a bullet, so a reveal that collapsed them would re-render the list as
   * prose halfway through and then snap it back into shape.
   */
  it('keeps newlines, because the markdown parser reads them', () => {
    const list = 'Right, sir.\n• ten mins: warm-up\n• thirty mins: strength';
    const steps = revealSteps(list);
    expect(steps[steps.length - 1]).toBe(list);
    const withBreak = steps.filter((s) => s.includes('\n'));
    expect(withBreak.length).toBeGreaterThan(0);
  });

  it('never emits the same step twice', () => {
    const steps = revealSteps('One two three four five');
    expect(new Set(steps).size).toBe(steps.length);
  });
});

describe('how long each step waits', () => {
  it('is quick enough to read along with', () => {
    expect(stepFor(10)).toBeGreaterThanOrEqual(20);
    expect(stepFor(10)).toBeLessThanOrEqual(120);
  });

  /**
   * The whole reveal is budgeted, not the step. A 400-word answer at a sentence's
   * pace would take half a minute, and the second time that happened he would be
   * asked to stop doing it.
   */
  it('does not let a long answer outstay its welcome', () => {
    const steps = revealSteps(Array.from({ length: 300 }, () => 'word').join(' '));
    expect(steps.length * stepFor(steps.length)).toBeLessThanOrEqual(3000);
  });

  it('is a real duration even for one step', () => {
    expect(stepFor(1)).toBeGreaterThan(0);
    expect(stepFor(0)).toBeGreaterThan(0);
  });
});
