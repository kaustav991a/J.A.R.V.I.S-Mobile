import { callSummary, lostTouch, missedToday, usualGapDays } from '../calls';
import type { Call } from '../calls';

/**
 * What the call log is for, and what it is not.
 *
 * Asked for on 2026-09-03 in one sentence — *notice who I have lost touch with* — and
 * chosen over `call:mom` rules, which live on a gateway that is frozen.
 *
 * **The number never appears here.** The native side hands over a stable id and the
 * name Android had already cached when the call happened, so an unknown caller stays
 * an unknown caller and is never named. Nothing in this file can print a phone number
 * because nothing in this file is ever given one.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-03T13:00:00').getTime();

const call = (name: string | null, daysAgo: number, kind: Call['kind'] = 'in'): Call => ({
  name,
  who: name ? `id-${name}` : 'id-unknown',
  at: NOW - daysAgo * DAY,
  kind,
  seconds: kind === 'missed' ? 0 : 120,
});

/** every other day for a fortnight, which is what "usually" means for this person */
const regular = (name: string, gap: number, count: number): Call[] =>
  Array.from({ length: count }, (_, i) => call(name, (i + 1) * gap));

describe('how often you usually speak', () => {
  it('measures the gap somebody is usually reached at', () => {
    expect(usualGapDays(regular('Mousumi', 2, 8), 'id-Mousumi')).toBe(2);
  });

  it('refuses a figure from too few calls, the way every other baseline does', () => {
    // two calls make one gap, and one gap is a coincidence with a confident voice
    expect(usualGapDays(regular('Rahul', 3, 2), 'id-Rahul')).toBeNull();
  });

  it('is unmoved by one long gap in an otherwise steady pattern', () => {
    const steady = [...regular('Mousumi', 2, 6), call('Mousumi', 40)];
    expect(usualGapDays(steady, 'id-Mousumi')).toBe(2);
  });
});

describe('who you have lost touch with', () => {
  it('names the person whose silence is furthest past their own usual', () => {
    // Mousumi every other day, last spoken six days ago; Rahul every ten days and
    // spoken to yesterday. Only one of those is unusual
    const calls = [
      ...regular('Mousumi', 2, 6).map((c) => ({ ...c, at: c.at - 4 * DAY })),
      ...regular('Rahul', 10, 5),
      call('Rahul', 1),
    ];
    const found = lostTouch(calls, new Date(NOW));
    expect(found?.name).toBe('Mousumi');
    expect(found?.days).toBeGreaterThanOrEqual(6);
    expect(found?.usual).toBe(2);
  });

  it('says nothing when everybody is roughly on schedule', () => {
    expect(lostTouch(regular('Mousumi', 2, 8), new Date(NOW))).toBeNull();
  });

  it('never names an unknown number, however long the silence', () => {
    // an unknown caller is a number, and this app does not gossip about numbers
    const strangers = Array.from({ length: 8 }, (_, i) => call(null, (i + 1) * 2));
    expect(lostTouch(strangers, new Date(NOW))).toBeNull();
  });

  it('says nothing without enough history to call anything usual', () => {
    expect(lostTouch([call('Mousumi', 9), call('Mousumi', 12)], new Date(NOW))).toBeNull();
  });
});

describe('missed calls today', () => {
  it('counts the ones from the same caller, which is what makes it worth saying', () => {
    const calls = [call(null, 0, 'missed'), call(null, 0, 'missed'), call(null, 0, 'missed')];
    expect(missedToday(calls, new Date(NOW))).toEqual({ name: null, count: 3 });
  });

  it('names the caller when Android had a name for them', () => {
    expect(missedToday([call('Rahul', 0, 'missed'), call('Rahul', 0, 'missed')], new Date(NOW)))
      .toEqual({ name: 'Rahul', count: 2 });
  });

  it('ignores a single missed call, which is a fact of life rather than a finding', () => {
    expect(missedToday([call('Rahul', 0, 'missed')], new Date(NOW))).toBeNull();
  });

  it('ignores yesterday, because today is the only day this is about', () => {
    expect(missedToday([call(null, 1, 'missed'), call(null, 1, 'missed')], new Date(NOW))).toBeNull();
  });

  it('is not confused by answered calls', () => {
    expect(missedToday([call('Rahul', 0), call('Rahul', 0)], new Date(NOW))).toBeNull();
  });
});

describe('what it managed to read', () => {
  /**
   * The row that answers *did it read anything at all*.
   *
   * On 2026-09-03 the app spoke about Instagram twice while the call triggers said
   * nothing, and there was no way to tell a module that had not loaded from a call log
   * where nobody was overdue. Those want different fixes and looked identical.
   */
  it('counts the calls and the people behind them', () => {
    const calls = [call('Mousumi', 1), call('Mousumi', 3), call('Rahul', 2), call(null, 4)];
    expect(callSummary(calls)).toMatchObject({ calls: 4, people: 2 });
  });

  it('says how far back the reading goes, since that is what a habit is built from', () => {
    expect(callSummary([call('Mousumi', 30), call('Mousumi', 1)]).days).toBe(30);
  });

  it('answers zero rather than nothing, so the row can say it read none', () => {
    expect(callSummary([])).toEqual({ calls: 0, people: 0, days: 0 });
  });
});
