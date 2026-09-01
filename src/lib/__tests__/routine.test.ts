import { elsewhereNow, leftEarly, usualPlaceAt, visitNow } from '../timeline';
import type { Seen } from '../timeline';

/**
 * Where you usually are at this hour on this weekday, and what today is doing instead.
 *
 * **The redesign of 2026-09-01, and the bug that forced it.** The first cut asked "are
 * you at a place earlier than you usually get there", which produced *"At Home early,
 * sir — usually you are there by 10:49 AM"* to somebody who had been at home all night
 * and was leaving for the office. Two things were wrong and only one of them was the
 * wording: nothing had *arrived*, and 10:49 was never an arrival time — a sighting is
 * written whenever the app resolves a named place, so the first sighting of a day is
 * the first time the app was OPENED there, which for the place you wake up in is not
 * an arrival at all.
 *
 * **So the model is routine and deviation, and it leans on what the data can actually
 * support.** Presence and departure are observable: the app is opened at home before
 * leaving, so "last seen at Home 08:10, Mon–Fri" is real. Arrival is barely observable
 * and is treated as the weak signal it is. Every remark here answers "today is not
 * like your other Tuesdays", which is the thing worth saying unprompted.
 *
 * Weekday-matched throughout, and that is not caution: a Mon–Fri pattern asserted onto
 * a Saturday is what made the gateway announce a shift that did not exist.
 */

/** August 2026: the 17th is a Monday, so 18th–21st are Tue–Fri and 22nd is a Saturday */
const at = (d: number, h: number, m = 0) => new Date(2026, 7, d, h, m).getTime();

const seen = (...rows: Array<[number, number, number, string]>): Seen[] =>
  rows.map(([d, h, m, place]) => ({ place, at: at(d, h, m) }));

/**
 * Four Tuesdays of the same shape: at Home in the morning, last seen there about
 * 08:10, then at the Office from around 09:30.
 */
const tuesdays: Seen[] = seen(
  [4, 7, 40, 'Home'],
  [4, 8, 10, 'Home'],
  [4, 9, 35, 'Office'],
  [11, 7, 50, 'Home'],
  [11, 8, 12, 'Home'],
  [11, 9, 30, 'Office'],
  [18, 7, 45, 'Home'],
  [18, 8, 8, 'Home'],
  [18, 9, 40, 'Office'],
  [25, 7, 55, 'Home'],
  [25, 8, 14, 'Home'],
  [25, 9, 25, 'Office']
);

/** the Tuesday after those four */
const tuesday = (h: number, m = 0) => new Date(2026, 8, 1, h, m);

describe('where you usually are at this hour', () => {
  it('says Home at eight in the morning', () => {
    expect(usualPlaceAt(tuesdays, tuesday(8, 0))?.place).toBe('Home');
  });

  it('says Office at half past nine', () => {
    expect(usualPlaceAt(tuesdays, tuesday(9, 35))?.place).toBe('Office');
  });

  it('carries how many days it is speaking from, so a remark can quote it', () => {
    expect(usualPlaceAt(tuesdays, tuesday(8, 0))?.days).toBe(4);
  });

  it('knows nothing about an hour it has never watched', () => {
    expect(usualPlaceAt(tuesdays, tuesday(2, 0))).toBeNull();
  });

  it('refuses to answer for a weekday it has not watched', () => {
    // the gateway announced a Saturday shift from a Mon–Fri pattern; this is that
    // mistake made impossible rather than merely avoided
    const saturday = new Date(2026, 8, 5, 8, 0);
    expect(usualPlaceAt(tuesdays, saturday)).toBeNull();
  });

  it('waits for enough of the same weekday before it will say anything', () => {
    const two = seen([4, 8, 10, 'Home'], [11, 8, 12, 'Home']);
    expect(usualPlaceAt(two, tuesday(8, 0))).toBeNull();
  });
});

describe('being somewhere your Tuesdays say you are not', () => {
  it('says where you usually are instead', () => {
    const out = elsewhereNow(tuesdays, 'Office', tuesday(8, 0));
    expect(out?.usual).toBe('Home');
    expect(out?.days).toBe(4);
  });

  it('says nothing when you are exactly where you usually are', () => {
    expect(elsewhereNow(tuesdays, 'Home', tuesday(8, 0))).toBeNull();
  });

  it('says nothing when it does not know where you are', () => {
    expect(elsewhereNow(tuesdays, null, tuesday(8, 0))).toBeNull();
  });

  it('says nothing at an hour it has no routine for', () => {
    expect(elsewhereNow(tuesdays, 'Office', tuesday(2, 0))).toBeNull();
  });
});

describe('leaving earlier than your Tuesdays do', () => {
  /** today: seen at Home at 7:05 and already at the Office by 7:30 */
  const leftAt7 = [...tuesdays, ...seen([1 + 31, 7, 5, 'Home'])];

  it('is silent while you are still there', () => {
    // 8:00 on a day you are still at Home is not a departure, however early it feels
    expect(leftEarly(tuesdays, 'Home', tuesday(8, 0), 'Home')).toBeNull();
  });

  it('names the gap once you are demonstrably elsewhere', () => {
    const today = [
      ...tuesdays,
      { place: 'Home', at: tuesday(7, 5).getTime() },
      { place: 'Office', at: tuesday(7, 40).getTime() },
    ];
    const out = leftEarly(today, 'Home', tuesday(7, 45), 'Office');
    expect(out?.place).toBe('Home');
    expect(out?.lastSeen).toBe(7 * 60 + 5);
    // 08:10-ish, from four Tuesdays
    expect(out?.usualBy).toBeGreaterThanOrEqual(8 * 60 + 8);
    expect(out?.days).toBe(4);
  });

  it('says nothing when you left at your usual time', () => {
    const today = [
      ...tuesdays,
      { place: 'Home', at: tuesday(8, 9).getTime() },
      { place: 'Office', at: tuesday(9, 30).getTime() },
    ];
    expect(leftEarly(today, 'Home', tuesday(9, 35), 'Office')).toBeNull();
  });

  it('says nothing about a place it never saw you at today', () => {
    expect(leftEarly(tuesdays, 'Home', tuesday(9, 35), 'Office')).toBeNull();
  });

  it('refuses to judge a Sunday by your Tuesdays', () => {
    const sunday = new Date(2026, 8, 6, 7, 45);
    const today = [
      ...tuesdays,
      { place: 'Home', at: new Date(2026, 8, 6, 7, 5).getTime() },
      { place: 'Office', at: new Date(2026, 8, 6, 7, 40).getTime() },
    ];
    expect(leftEarly(today, 'Home', sunday, 'Office')).toBeNull();
  });
});

describe('the visit you are in the middle of', () => {
  it('starts when you arrived, not when the app was last opened', () => {
    // the whole of yesterday evening and this morning is ONE visit to Home, which is
    // why "you are here early" must not fire on it: nothing arrived this morning
    const overnight = seen([31, 19, 30, 'Home'], [31, 22, 10, 'Home'], [32, 7, 40, 'Home']);
    const visit = visitNow(overnight, new Date(2026, 8, 1, 8, 11));
    expect(visit?.place).toBe('Home');
    expect(new Date(visit!.since).getHours()).toBe(19);
  });

  it('knows an arrival happened when the visit before it was elsewhere', () => {
    const commute = seen([1 + 31, 7, 5, 'Home'], [1 + 31, 9, 30, 'Office']);
    const visit = visitNow(commute, new Date(2026, 8, 1, 9, 35));
    expect(visit?.place).toBe('Office');
    expect(visit?.arrived).toBe(true);
  });

  it('does not call the first thing it ever saw an arrival', () => {
    const only = seen([1 + 31, 9, 30, 'Office']);
    expect(visitNow(only, new Date(2026, 8, 1, 9, 35))?.arrived).toBe(false);
  });

  it('has nothing to say when the log is empty', () => {
    expect(visitNow([], new Date(2026, 8, 1, 9, 35))).toBeNull();
  });
});

/**
 * Weekends, which the first cut segmented correctly and could never actually learn.
 *
 * `sameWeekdayDays` compares Saturdays with Saturdays, which is right. But sightings
 * were kept for 28 days, so a Saturday had **at most four** samples and the rules
 * wanted four — a weekend routine therefore needed a flawless month and in practice
 * never formed at all.
 *
 * Two changes. History is kept long enough for a weekday to accumulate, and where the
 * exact weekday is still thin the routine falls back to the KIND of day — weekend or
 * weekday — which is the next most honest grouping. A Saturday is more like a Sunday
 * than like a Tuesday, and saying so beats saying nothing.
 */
const sat = (d: number, h: number, m: number, place: string): Seen => ({
  place,
  at: new Date(2026, 7, d, h, m).getTime(),
});

describe('learning a weekend', () => {
  /** Aug 2026: 1, 8, 15, 22 are Saturdays; 2, 9, 16 are Sundays */
  const saturdays = [
    sat(1, 10, 30, 'Home'),
    sat(8, 10, 45, 'Home'),
    sat(15, 10, 20, 'Home'),
  ];

  const nextSaturday = new Date(2026, 7, 29, 10, 30);

  it('learns Saturdays from Saturdays once it has enough of them', () => {
    const out = usualPlaceAt(saturdays, nextSaturday);
    expect(out?.place).toBe('Home');
    expect(out?.basis).toBe('weekday');
  });

  it('falls back to the kind of day when the weekday itself is thin', () => {
    // two Saturdays and two Sundays: not enough of either alone, and plenty of
    // weekend. A Saturday is more like a Sunday than like a Tuesday
    const weekend = [
      sat(1, 10, 30, 'Home'),
      sat(2, 10, 40, 'Home'),
      sat(8, 10, 20, 'Home'),
      sat(9, 10, 50, 'Home'),
    ];
    const out = usualPlaceAt(weekend, nextSaturday);
    expect(out?.place).toBe('Home');
    expect(out?.basis).toBe('kind');
    expect(out?.kind).toBe('weekend');
  });

  it('never lets a weekday routine stand in for a weekend one', () => {
    // the mistake the gateway made, in its other direction: four Tuesdays say
    // nothing whatever about a Saturday morning
    const weekdaysOnly = [
      sat(4, 10, 30, 'Office'),
      sat(5, 10, 30, 'Office'),
      sat(6, 10, 30, 'Office'),
      sat(7, 10, 30, 'Office'),
    ];
    expect(usualPlaceAt(weekdaysOnly, nextSaturday)).toBeNull();
  });

  it('does not let a weekend stand in for a weekday either', () => {
    const weekendOnly = [
      sat(1, 10, 30, 'Home'),
      sat(2, 10, 40, 'Home'),
      sat(8, 10, 20, 'Home'),
      sat(9, 10, 50, 'Home'),
    ];
    const tuesdayMorning = new Date(2026, 7, 25, 10, 30);
    expect(usualPlaceAt(weekendOnly, tuesdayMorning)).toBeNull();
  });
});

describe('a routine that has changed', () => {
  it('follows the newest days rather than being outvoted by old ones', () => {
    // a job left in July must not argue with where somebody is in September. Twelve
    // weeks of history is kept so a weekend can accumulate; only the recent days are
    // read, so the pattern follows a life rather than outliving it
    const oldSaturdays = [1, 8, 15].map((d) => sat(d, 10, 30, 'Office'));
    const newSaturdays = [22, 29, 36, 43, 50, 57].map((d) => sat(d, 10, 30, 'Cafe'));
    const out = usualPlaceAt([...oldSaturdays, ...newSaturdays], new Date(2026, 9, 3, 10, 30));
    expect(out?.place).toBe('Cafe');
  });
});
