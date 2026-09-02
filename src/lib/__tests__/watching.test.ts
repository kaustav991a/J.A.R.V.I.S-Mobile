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
  goneBy: null,
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

/**
 * What it learned, said out loud.
 *
 * The row that closes `timeline`'s named gap: the app was spending four days learning
 * an hour and then never telling anyone what it had learned. The only place that
 * figure ever surfaced was the anticipation remark, which fires **only** when you are
 * 45 minutes past it — so on every ordinary day it was invisible, and an invisible
 * figure is one nobody can disagree with.
 *
 * That is the anticipation doctrine's own third test, applied to the readout rather
 * than to the remark: *falsifiable — a figure you could disagree with, not an
 * adjective*. `Office, ready` passed nothing. `6:40 PM` can be wrong out loud.
 */
describe('the hour it has learned', () => {
  it('says the time once it knows one, rather than merely calling itself ready', () => {
    const row = watching(facts({ goneBy: 18 * 60 + 40 })).find((r) => r.id === 'place');
    expect(row?.ready).toBe(true);
    expect(row?.word).toBe('6:40 PM');
  });

  it('names the place and the days it rests on, so a wrong figure can be argued with', () => {
    const row = watching(facts({ goneBy: 18 * 60 + 40, placeDays: 6 })).find((r) => r.id === 'place');
    expect(row?.note).toContain('Office');
    expect(row?.note).toContain('6 days');
  });

  it('still counts down while it is short of days, whatever it thinks it has seen', () => {
    const row = watching(facts({ placeDays: 3, goneBy: 18 * 60 + 40 })).find((r) => r.id === 'place');
    expect(row?.ready).toBe(false);
    expect(row?.word).toBe('1 more day');
  });

  it('does not claim an hour it has not got, even with the days behind it', () => {
    // enough days at the place, but every sighting on one of them — `usuallyGoneBy`
    // returns null and the row must not invent a time to fill the space
    const row = watching(facts({ goneBy: null })).find((r) => r.id === 'place');
    expect(row?.ready).toBe(true);
    expect(row?.word).toBe('Office, ready');
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

describe('the departure row prefers a measured one', () => {
  /**
   * The row used to say "It cannot see you leave".
   *
   * That was true for as long as a sighting needed the app to be open, and it stopped
   * being true on 2026-09-01 at 19:08, when a geofence exit recorded him leaving the
   * office with the phone in his pocket. The panel kept saying it anyway — over a
   * 9:04 PM figure that is where he TURNS UP, an hour and a half after he left.
   */
  const facts = (over: Partial<WatchFacts> = {}): WatchFacts => ({
    baselineDays: 9,
    placeDays: 7,
    place: 'Office',
    goneBy: 21 * 60 + 4,
    goneTo: 'Home',
    spokenToday: false,
    ...over,
  });

  it('shows the measured time, not the hour he turns up somewhere else', () => {
    const row = watching(facts({ leftAt: { minute: 19 * 60 + 8, measured: true } })).find(
      (r) => /leave/i.test(r.label)
    );
    expect(row?.word).toBe('7:08 PM');
  });

  it('says it watched him go, rather than what it cannot do', () => {
    const row = watching(facts({ leftAt: { minute: 19 * 60 + 8, measured: true } })).find(
      (r) => /leave/i.test(r.label)
    );
    expect(row?.note).toMatch(/crossed|boundary|app closed/i);
    expect(row?.note).not.toMatch(/cannot see you leave/i);
  });

  it('falls back to where he turns up when nothing has been measured yet', () => {
    const row = watching(facts({ leftAt: null })).find((r) => /turn up next/i.test(r.label));
    expect(row?.word).toBe('9:04 PM');
  });

  it('never prints its own asterisks at somebody', () => {
    // the note is rendered as plain Text: markdown emphasis arrives on screen as
    // literal ** characters, which is what the phone showed on 2026-09-02
    for (const row of watching(facts({ leftAt: null }))) {
      expect(row.note ?? '').not.toContain('**');
    }
  });
});
