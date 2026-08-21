import { watching } from '../watching';
import type { WatchFacts } from '../watching';

/**
 * What he is watching, and what he is still waiting for.
 *
 * Asked for on 2026-08-21, and the reason is the rule this codebase keeps relearning:
 * **a feature that says nothing is indistinguishable from a broken one.** Anticipation
 * is silent most days by design, and silent for its first four days by necessity —
 * without this panel there is no way to tell that apart from a fault.
 */
const facts = (over: Partial<WatchFacts> = {}): WatchFacts => ({
  baselineDays: 9,
  placeDays: 4,
  place: 'Office',
  spokenToday: false,
  ...over,
});

describe('the screen-time signal', () => {
  it('is ready once there are enough days', () => {
    const row = watching(facts()).find((r) => r.id === 'usage');
    expect(row?.ready).toBe(true);
    expect(row?.word).toContain('9 days');
  });

  it('counts down while it is still short', () => {
    const row = watching(facts({ baselineDays: 1 })).find((r) => r.id === 'usage');
    expect(row?.ready).toBe(false);
    // the number of days still owed, so it reads as progress rather than as a fault
    expect(row?.word).toBe('2 more days');
  });

  it('says one day rather than 1 more days', () => {
    expect(watching(facts({ baselineDays: 2 })).find((r) => r.id === 'usage')?.word).toBe('1 more day');
  });
});

describe('the place signal', () => {
  it('is ready once there are enough days at a place', () => {
    const row = watching(facts()).find((r) => r.id === 'place');
    expect(row?.ready).toBe(true);
    expect(row?.word).toContain('Office');
  });

  it('counts down, and names how many are still owed', () => {
    const row = watching(facts({ placeDays: 1 })).find((r) => r.id === 'place');
    expect(row?.ready).toBe(false);
    expect(row?.word).toBe('3 more days');
  });

  it('says what it is waiting for when it has never seen a named place', () => {
    // the honest state on a fresh install, and the one most likely to look broken
    const row = watching(facts({ placeDays: 0, place: null })).find((r) => r.id === 'place');
    expect(row?.ready).toBe(false);
    expect(row?.word).toBe('4 more days');
  });
});

describe('whether he has already spoken', () => {
  it('says so, and that it will not speak again today', () => {
    const row = watching(facts({ spokenToday: true })).find((r) => r.id === 'today');
    expect(row?.ready).toBe(false);
    expect(row?.word).toBe('SPOKEN');
  });

  it('says he is free to, when he has not', () => {
    const row = watching(facts()).find((r) => r.id === 'today');
    expect(row?.ready).toBe(true);
    expect(row?.word).toBe('LISTENING');
  });
});

describe('every row', () => {
  it('carries a label and a word, never a bare state', () => {
    for (const r of watching(facts())) {
      expect(r.label.length).toBeGreaterThan(3);
      expect(r.word.length).toBeGreaterThan(1);
    }
  });

  it('keeps a stable order, so nothing shuffles under a finger', () => {
    expect(watching(facts()).map((r) => r.id)).toEqual(['today', 'usage', 'place']);
  });
});
