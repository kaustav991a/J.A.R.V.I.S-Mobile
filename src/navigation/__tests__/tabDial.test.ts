import { centreAt, centreOf, magnetize, projectDetent, widthAt, MAGNET } from '../GlassTabBar';

/** five tabs, as the app has, with names of different lengths */
const OPENS = [96, 108, 92, 104, 116];
const LAST = OPENS.length - 1;

describe('magnetize', () => {
  it('leaves a detent exactly where it is', () => {
    for (let i = 0; i <= LAST; i++) expect(magnetize(i)).toBeCloseTo(i, 6);
  });

  it('leaves the midpoint alone — the dial is only pulled, never shifted', () => {
    expect(magnetize(0.5)).toBeCloseTo(0.5, 6);
    expect(magnetize(3.5)).toBeCloseTo(3.5, 6);
  });

  it('holds the dial back while it is still near the detent it is leaving', () => {
    expect(magnetize(0.1)).toBeLessThan(0.1);
    expect(magnetize(0.25)).toBeLessThan(0.25);
  });

  it('lets go once the next detent is the nearer one', () => {
    expect(magnetize(0.9)).toBeGreaterThan(0.9);
    expect(magnetize(0.75)).toBeGreaterThan(0.75);
  });

  it('never stalls: the dial keeps moving with the finger everywhere', () => {
    // a stall would read as a stuck control. strictly increasing, always.
    let prev = magnetize(-0.4);
    for (let raw = -0.4; raw <= LAST + 0.4; raw += 0.01) {
      const now = magnetize(raw);
      expect(now).toBeGreaterThanOrEqual(prev);
      prev = now;
    }
  });

  it('is continuous across a detent boundary', () => {
    expect(Math.abs(magnetize(0.999) - magnetize(1.001))).toBeLessThan(0.01);
  });

  it('is linear when the magnet is off', () => {
    for (const raw of [0.1, 0.37, 2.8]) expect(magnetize(raw, 0)).toBeCloseTo(raw, 6);
  });

  it('resists harder the stronger the magnet', () => {
    expect(magnetize(0.15, 0.9)).toBeLessThan(magnetize(0.15, MAGNET));
  });
});

describe('centreAt', () => {
  it('agrees with centreOf at every detent', () => {
    for (let i = 0; i <= LAST; i++) expect(centreAt(i, OPENS)).toBeCloseTo(centreOf(i, i, OPENS), 6);
  });

  it('does not jump as the dial crosses a boundary', () => {
    // the bug this replaces: rounding the target index moved the strip by half
    // of two tab widths in one frame, right in the middle of a drag
    for (const edge of [0.5, 1.5, 2.5, 3.5]) {
      const before = centreAt(edge - 0.001, OPENS);
      const after = centreAt(edge + 0.001, OPENS);
      expect(Math.abs(after - before)).toBeLessThan(0.5);
    }
  });

  it('slides one way only, from the first tab to the last', () => {
    let prev = centreAt(0, OPENS);
    for (let pos = 0; pos <= LAST; pos += 0.02) {
      const now = centreAt(pos, OPENS);
      expect(now).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = now;
    }
  });

  it('keeps following past the ends, so the rubber band has somewhere to go', () => {
    expect(centreAt(-0.3, OPENS)).toBeLessThan(centreAt(0, OPENS));
    expect(centreAt(LAST + 0.3, OPENS)).toBeGreaterThan(centreAt(LAST, OPENS));
  });
});

describe('projectDetent', () => {
  it('settles where it is when the finger stops dead', () => {
    expect(projectDetent(2.1, 0, LAST)).toBe(2);
    expect(projectDetent(1.6, 0, LAST)).toBe(2);
  });

  it('carries past the neighbour on a hard flick', () => {
    // the old code clamped the throw to one detent, so this was unreachable
    expect(projectDetent(0, -1400, LAST)).toBeGreaterThan(1);
  });

  it('goes the way the finger went', () => {
    expect(projectDetent(2, -900, LAST)).toBeGreaterThan(2);
    expect(projectDetent(2, 900, LAST)).toBeLessThan(2);
  });

  it('never leaves the dial, however wild the swipe', () => {
    expect(projectDetent(4, -99999, LAST)).toBe(LAST);
    expect(projectDetent(0, 99999, LAST)).toBe(0);
  });

  it('caps the throw so one flick cannot cross the whole dial', () => {
    expect(projectDetent(0, -99999, 20)).toBe(3);
  });

  it('always lands on a detent, never between two', () => {
    for (const v of [-2000, -600, -120, 0, 120, 600, 2000]) {
      expect(Number.isInteger(projectDetent(2.3, v, LAST))).toBe(true);
    }
  });
});

describe('widthAt', () => {
  it('spends width only on the tab under the lens', () => {
    expect(widthAt(0, 0, OPENS)).toBeCloseTo(OPENS[0], 6);
    expect(widthAt(2, 0, OPENS)).toBeCloseTo(52, 6);
  });

  it('opens the arriving tab as the leaving one closes', () => {
    const mid = widthAt(0, 0.5, OPENS) + widthAt(1, 0.5, OPENS);
    expect(mid).toBeCloseTo(52 + (OPENS[0] - 52) * 0.5 + 52 + (OPENS[1] - 52) * 0.5, 6);
  });
});
