import {
  ENOUGH_PLACE_DAYS,
  LATE_BY_MIN,
  absentFrom,
  daysSeenAt,
  hereEarly,
  nextSeenElsewhere,
  placesSeen,
  seenElsewhereBy,
  stillHereLate,
  usuallyGoneBy,
  usuallyHereBy,
} from '../timeline';
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
  /**
   * Four days that show him leaving: last at Office, then Home in the evening.
   *
   * The fixture used to be Office sightings alone, and the rule changed under it on
   * 2026-09-01 — without a later sighting somewhere else there is no evidence he ever
   * leaves, and "still here" is a word the data cannot support.
   */
  const leaves = seen(
    [17, 18, 30, 'Office'],
    [17, 20, 10, 'Home'],
    [18, 18, 45, 'Office'],
    [18, 20, 30, 'Home'],
    [19, 18, 40, 'Office'],
    [19, 19, 50, 'Home'],
    [20, 18, 35, 'Office'],
    [20, 20, 20, 'Home']
  );
  const elsewhere = seenElsewhereBy(leaves, 'Office', NOW) as number;

  it('is true well past the hour he is usually elsewhere', () => {
    const late = new Date(2026, 7, 21, 21, 10);
    expect(stillHereLate(leaves, 'Office', late)).toBe(true);
  });

  it('is false at that hour, because that is not news', () => {
    const onTime = new Date(2026, 7, 21, 20, 10);
    expect(stillHereLate(leaves, 'Office', onTime)).toBe(false);
  });

  it('waits for a real margin, not a minute', () => {
    const barely = new Date(2026, 7, 21, 0, 0, 0);
    barely.setHours(0, elsewhere + Math.floor(LATE_BY_MIN / 2), 0, 0);
    expect(stillHereLate(leaves, 'Office', barely)).toBe(false);
  });

  it('is false somewhere with no history', () => {
    expect(stillHereLate(leaves, 'Airport', new Date(2026, 7, 21, 23, 0))).toBe(false);
  });

  it('is false when nowhere is known', () => {
    expect(stillHereLate([], 'Office', NOW)).toBe(false);
  });
});

/**
 * The countdown the Home panel shows, so a silent feature is not mistaken for a
 * broken one — the failure this project has paid for more than any other.
 */
describe('how many days it has seen you somewhere', () => {
  it('counts distinct days, not sightings', () => {
    // two sightings on one day is one day of evidence
    expect(daysSeenAt(office, 'Office', NOW)).toBe(4);
  });

  it('excludes today, which is the day being judged', () => {
    const withToday = [...office, ...seen([21, 9, 0, 'Office'])];
    expect(daysSeenAt(withToday, 'Office', NOW)).toBe(4);
  });

  it('is zero somewhere it has never seen you', () => {
    expect(daysSeenAt(office, 'Airport', NOW)).toBe(0);
  });
});

/**
 * Arrival, and being absent from somewhere you are usually at.
 *
 * The mirror of `usuallyGoneBy`, and it carries one extra rule the departure side
 * does not need: **absence is judged against the same weekday only.** A Mon–Fri
 * pattern asserted onto a Saturday is what broke the gateway's own nudge on
 * 2026-08-21 — it announced a shift that did not exist — and "you are not at the
 * office" on a Sunday morning is the identical mistake with a different subject.
 */
describe('when you are usually there', () => {
  it('says nothing until it has enough days', () => {
    expect(usuallyHereBy(seen([17, 9, 0, 'Office'], [18, 9, 10, 'Office']), 'Office', NOW)).toBeNull();
  });

  it('takes the median of the ARRIVALS, not of the first app-open', () => {
    // Each day begins at Home and then reaches the Office: only the second of those
    // is an arrival. Counting first-sightings instead is what produced "usually you
    // are there by 10:49 AM" about somebody's own home on 2026-09-01 — the first
    // sighting of a day is just the first time the app was opened there.
    // 9:00, 9:10, 8:50, 9:05 -> 9:00 (lower middle of an even count)
    const arrivals = seen(
      [17, 7, 30, 'Home'],
      [17, 9, 0, 'Office'],
      [17, 18, 30, 'Office'],
      [18, 7, 40, 'Home'],
      [18, 9, 10, 'Office'],
      [19, 7, 20, 'Home'],
      [19, 8, 50, 'Office'],
      [20, 7, 35, 'Home'],
      [20, 9, 5, 'Office']
    );
    expect(usuallyHereBy(arrivals, 'Office', NOW)).toBe(9 * 60);
  });

  it('does not count a stay it never saw begin', () => {
    // sightings at one place and nothing before them: the app has no evidence anybody
    // arrived, so it has no arrival time to quote
    const noArrivals = seen(
      [17, 9, 0, 'Office'],
      [18, 9, 10, 'Office'],
      [19, 8, 50, 'Office'],
      [20, 9, 5, 'Office']
    );
    expect(usuallyHereBy(noArrivals, 'Office', NOW)).toBeNull();
  });

  it('ignores today, which is the day being judged', () => {
    const withToday = [...office, ...seen([21, 6, 0, 'Office'])];
    expect(usuallyHereBy(withToday, 'Office', NOW)).toBe(usuallyHereBy(office, 'Office', NOW));
  });
});

describe('arriving somewhere earlier than usual', () => {
  /** four days of leaving Home and reaching the Office around nine */
  const arrivals = seen(
    [17, 7, 30, 'Home'],
    [17, 9, 0, 'Office'],
    [18, 7, 40, 'Home'],
    [18, 9, 10, 'Office'],
    [19, 7, 20, 'Home'],
    [19, 8, 50, 'Office'],
    [20, 7, 35, 'Home'],
    [20, 9, 5, 'Office']
  );

  /** today: left Home at 7:10 and reached the Office at 7:55 */
  const today = [...arrivals, ...seen([21, 7, 10, 'Home'], [21, 7, 55, 'Office'])];

  it('is worth saying an hour early, with the usual named', () => {
    expect(hereEarly(today, 'Office', new Date(2026, 7, 21, 8, 0))).toEqual({
      usualBy: 9 * 60,
      at: 7 * 60 + 55,
    });
  });

  it('times the arrival, not the moment somebody looked at the phone', () => {
    // asked at 8:30, the remark is still about a 7:55 arrival
    expect(hereEarly(today, 'Office', new Date(2026, 7, 21, 8, 30))?.at).toBe(7 * 60 + 55);
  });

  it('is nothing to remark on ten minutes early', () => {
    const barely = [...arrivals, ...seen([21, 7, 10, 'Home'], [21, 8, 50, 'Office'])];
    expect(hereEarly(barely, 'Office', new Date(2026, 7, 21, 9, 0))).toBeNull();
  });

  it('says nothing about arriving late, which the departure side does not cover either', () => {
    const late = [...arrivals, ...seen([21, 7, 10, 'Home'], [21, 10, 30, 'Office'])];
    expect(hereEarly(late, 'Office', new Date(2026, 7, 21, 10, 35))).toBeNull();
  });

  it('**says nothing about a stay that began yesterday**', () => {
    // the bug, pinned: at Home all night, leaving for the office, told he was at Home
    // early. Nothing arrived — the visit he was in had started the evening before
    const overnight = seen(
      [17, 19, 0, 'Home'],
      [17, 9, 0, 'Office'],
      [18, 19, 10, 'Home'],
      [18, 9, 0, 'Office'],
      [19, 19, 5, 'Home'],
      [19, 9, 0, 'Office'],
      [20, 19, 30, 'Home'],
      [20, 9, 0, 'Office'],
      [20, 22, 0, 'Home'],
      [21, 7, 40, 'Home']
    );
    expect(hereEarly(overnight, 'Home', new Date(2026, 7, 21, 8, 11))).toBeNull();
  });
});

describe('not being somewhere you usually are', () => {
  /** four Fridays of arriving at Office by 9, so a Friday has a baseline */
  const fridays = seen(
    [7, 9, 0, 'Office'],
    [14, 9, 10, 'Office'],
    [21, 8, 50, 'Office'],
    [28, 9, 5, 'Office']
  );
  // 2026-09-04 is the Friday after the last of those
  const friday = (h: number, m = 0) => new Date(2026, 8, 4, h, m);

  it('says nothing before the hour you are usually there by', () => {
    expect(absentFrom(fridays, 'Office', friday(8, 30))).toBeNull();
  });

  it('says nothing in the first hour after it, which is a late train', () => {
    expect(absentFrom(fridays, 'Office', friday(9, 30))).toBeNull();
  });

  it('is worth saying well past the hour, with the usual named', () => {
    expect(absentFrom(fridays, 'Office', friday(10, 30))?.usualBy).toBe(9 * 60);
  });

  it('says nothing once you have been seen there today', () => {
    const withToday = [...fridays, { place: 'Office', at: friday(9, 45).getTime() }];
    expect(absentFrom(withToday, 'Office', friday(10, 30))).toBeNull();
  });

  it('refuses to judge a Sunday by your weekdays', () => {
    // the exact shape that broke the gateway nudge: a Mon–Fri pattern asserted
    // onto a day it had never seen
    const sunday = new Date(2026, 8, 6, 10, 30);
    expect(absentFrom(fridays, 'Office', sunday)).toBeNull();
  });
});

describe('which places it has ever seen you at', () => {
  it('names each one once, however many sightings there are', () => {
    const mixed = seen([17, 9, 0, 'Office'], [17, 20, 0, 'Home'], [18, 9, 0, 'Office']);
    expect(placesSeen(mixed).sort()).toEqual(['Home', 'Office']);
  });

  it('is empty before anything has been seen', () => {
    expect(placesSeen([])).toEqual([]);
  });
});

/**
 * When you are next seen somewhere else, which is the only bound on leaving.
 *
 * **Reported from the phone, 2026-09-01:** the panel said *"When you are usually gone —
 * 3:40 PM"* about an office he leaves at seven. The figure was the median of the LAST
 * SIGHTING at Office, and a sighting needs the app open — so it measured when he stops
 * checking his phone at work, and then called it leaving.
 *
 * The app cannot see a departure. It can see two things that bracket one: the last
 * time he was at the place, and the first time he was somewhere else. Between them is
 * where the leaving happened, and that is the honest thing to hold.
 */
describe('when you are next seen elsewhere', () => {
  /** four days: last at Office mid-afternoon, then Home in the evening */
  const commutes = seen(
    [17, 15, 40, 'Office'],
    [17, 20, 10, 'Home'],
    [18, 15, 30, 'Office'],
    [18, 20, 30, 'Home'],
    [19, 15, 50, 'Office'],
    [19, 19, 50, 'Home'],
    [20, 15, 35, 'Office'],
    [20, 20, 20, 'Home']
  );

  it('takes the median of the first sighting somewhere else', () => {
    // 20:10, 20:30, 19:50, 20:20 -> 20:10 (lower middle of an even count)
    expect(seenElsewhereBy(commutes, 'Office', NOW)).toBe(20 * 60 + 10);
  });

  it('says nothing on days that never showed him anywhere else', () => {
    // without a later sighting elsewhere there is no evidence he left at all
    const noEvidence = seen(
      [17, 15, 40, 'Office'],
      [18, 15, 30, 'Office'],
      [19, 15, 50, 'Office'],
      [20, 15, 35, 'Office']
    );
    expect(seenElsewhereBy(noEvidence, 'Office', NOW)).toBeNull();
  });

  it('ignores a sighting elsewhere that came before the day at that place', () => {
    // Home in the morning is not evidence of leaving the Office in the evening
    const morningsOnly = seen(
      [17, 8, 0, 'Home'],
      [17, 15, 40, 'Office'],
      [18, 8, 0, 'Home'],
      [18, 15, 30, 'Office'],
      [19, 8, 0, 'Home'],
      [19, 15, 50, 'Office'],
      [20, 8, 0, 'Home'],
      [20, 15, 35, 'Office']
    );
    expect(seenElsewhereBy(morningsOnly, 'Office', NOW)).toBeNull();
  });
});

describe('still being somewhere, judged against the honest bound', () => {
  const commutes = seen(
    [17, 15, 40, 'Office'],
    [17, 20, 10, 'Home'],
    [18, 15, 30, 'Office'],
    [18, 20, 30, 'Home'],
    [19, 15, 50, 'Office'],
    [19, 19, 50, 'Home'],
    [20, 15, 35, 'Office'],
    [20, 20, 20, 'Home']
  );

  it('**stays quiet at half four, which the old figure called late**', () => {
    // the reported bug: last seen 3:40 plus a 45 minute margin fired every workday
    expect(stillHereLate(commutes, 'Office', new Date(2026, 7, 21, 16, 25))).toBe(false);
  });

  it('speaks once you are past the hour you are usually elsewhere', () => {
    expect(stillHereLate(commutes, 'Office', new Date(2026, 7, 21, 21, 10))).toBe(true);
  });

  it('says nothing when nothing bounds the leaving', () => {
    const noEvidence = seen(
      [17, 15, 40, 'Office'],
      [18, 15, 30, 'Office'],
      [19, 15, 50, 'Office'],
      [20, 15, 35, 'Office']
    );
    expect(stillHereLate(noEvidence, 'Office', new Date(2026, 7, 21, 23, 30))).toBe(false);
  });
});

/**
 * Naming where you are next seen, because a named place is checkable.
 *
 * The panel said "by 8:04 PM you are usually elsewhere" and the answer came back
 * instantly: *8:04 is generally in the train at Sealdah*. That is the whole argument
 * for naming it — a figure with a place attached can be confirmed or contradicted in
 * one sentence, and this one was confirmed in one sentence.
 */
describe('where you are next seen, not only when', () => {
  const commute = seen(
    [17, 18, 30, 'Office'],
    [17, 20, 4, 'Sealdah Rail Station'],
    [17, 21, 30, 'Home'],
    [18, 18, 45, 'Office'],
    [18, 20, 10, 'Sealdah Rail Station'],
    [19, 18, 40, 'Office'],
    [19, 19, 58, 'Sealdah Rail Station'],
    [20, 18, 35, 'Office'],
    [20, 20, 12, 'Sealdah Rail Station']
  );

  it('names the place you are usually seen at next', () => {
    expect(nextSeenElsewhere(commute, 'Office', NOW)?.place).toBe('Sealdah Rail Station');
  });

  it('carries the hour with it', () => {
    // 20:04, 20:10, 19:58, 20:12 -> 20:04 (lower middle of an even count)
    expect(nextSeenElsewhere(commute, 'Office', NOW)?.minute).toBe(20 * 60 + 4);
  });

  it('picks the place seen most often, not merely the first ever seen', () => {
    const mostly = [
      ...commute,
      ...seen([16, 18, 30, 'Office'], [16, 20, 0, 'Ichapur Station']),
    ];
    expect(nextSeenElsewhere(mostly, 'Office', NOW)?.place).toBe('Sealdah Rail Station');
  });

  it('says nothing when no day ever showed him leaving', () => {
    const noEvidence = seen(
      [17, 15, 40, 'Office'],
      [18, 15, 30, 'Office'],
      [19, 15, 50, 'Office'],
      [20, 15, 35, 'Office']
    );
    expect(nextSeenElsewhere(noEvidence, 'Office', NOW)).toBeNull();
  });
});
