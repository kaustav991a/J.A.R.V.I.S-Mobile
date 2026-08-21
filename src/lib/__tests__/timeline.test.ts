import { ENOUGH_PLACE_DAYS, LATE_BY_MIN, stillHereLate, usuallyGoneBy } from '../timeline';
import type { Seen } from '../timeline';

/**
 * When you are usually gone from a place, and whether you are still there.
 *
 * The one observation worth having, and the reason: it is not a setting you typed and
 * it is not on any screen. `anticipate` had two triggers on 2026-08-21 and one was
 * withdrawn the same day for failing exactly that test — a countdown to a leaving
 * time you had entered yourself.
 *
 * **What this actually measures is LAST SEEN, not left.** Sightings only happen when
 * the app is opened, so the estimate is biased early: if you never open it on the way
 * out, the last sighting is from before you went. Handled by taking a median across
 * days rather than a mean, requiring several days, and adding a margin before saying
 * anything — and by wording the remark as a figure that can be argued with.
 */
const day = (d: number, h: number, m = 0) => new Date(2026, 7, d, h, m).getTime();

const seen = (...rows: Array<[number, number, number, string]>): Seen[] =>
  rows.map(([d, h, m, place]) => ({ place, at: day(d, h, m) }));

/** four weekdays of leaving Office around 18:40, and one long day */
const office: Seen[] = seen(
  [17, 18, 30, 'Office'],
  [17, 9, 0, 'Office'],
  [18, 18, 45, 'Office'],
  [19, 18, 40, 'Office'],
  [20, 18, 35, 'Office'],
  [20, 10, 0, 'Office']
);

const NOW = new Date(2026, 7, 21, 19, 30);

describe('when you are usually gone', () => {
  it('takes the last sighting of each day, then the middle day', () => {
    // 18:30, 18:45, 18:40, 18:35 -> median of the four, in minutes past midnight
    const gone = usuallyGoneBy(office, 'Office', NOW);
    expect(gone).not.toBeNull();
    expect(gone).toBeGreaterThanOrEqual(18 * 60 + 30);
    expect(gone).toBeLessThanOrEqual(18 * 60 + 45);
  });

  it('says nothing until there are enough days to call it usual', () => {
    const two = seen([19, 18, 40, 'Office'], [20, 18, 35, 'Office']);
    expect(usuallyGoneBy(two, 'Office', NOW)).toBeNull();
    expect(ENOUGH_PLACE_DAYS).toBeGreaterThan(2);
  });

  it('ignores other places entirely', () => {
    const mixed = [...office, ...seen([19, 23, 0, 'Home'], [20, 23, 30, 'Home'])];
    const gone = usuallyGoneBy(mixed, 'Office', NOW);
    expect(gone).toBeLessThan(19 * 60);
  });

  it('ignores today, which is the day being judged', () => {
    // today's sightings are the question, not the evidence — including them would let
    // a late evening quietly raise the bar it is being measured against
    const withToday = [...office, ...seen([21, 22, 0, 'Office'])];
    expect(usuallyGoneBy(withToday, 'Office', NOW)).toBe(usuallyGoneBy(office, 'Office', NOW));
  });
});

describe('whether you are still there, late', () => {
  const gone = usuallyGoneBy(office, 'Office', NOW) as number;

  it('is true well past the usual hour, in the same place', () => {
    const late = new Date(2026, 7, 21, 19, 40);
    expect(stillHereLate(office, 'Office', late)).toBe(true);
  });

  it('is false at the usual hour, because that is not news', () => {
    const onTime = new Date(2026, 7, 21, 18, 45);
    expect(stillHereLate(office, 'Office', onTime)).toBe(false);
  });

  it('waits for a real margin, not a minute', () => {
    const barely = new Date(2026, 7, 21, 0, 0, 0);
    barely.setHours(0, gone + Math.floor(LATE_BY_MIN / 2), 0, 0);
    expect(stillHereLate(office, 'Office', barely)).toBe(false);
  });

  it('is false somewhere with no history', () => {
    expect(stillHereLate(office, 'Airport', new Date(2026, 7, 21, 23, 0))).toBe(false);
  });

  it('is false when nowhere is known', () => {
    expect(stillHereLate([], 'Office', NOW)).toBe(false);
  });
});
