import { dayHeading } from '../ChatScreen';

/**
 * The heading over each day's turns.
 *
 * Every line used to carry its own date once the log outlived the app, which put
 * `12 Aug, 14:32` on twenty consecutive lines from one afternoon. The date moved
 * to a rule between the days; these pin what that rule says.
 */

const on = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
const now = new Date(2026, 7, 14, 21, 30); // Friday 14 August 2026

describe('dayHeading', () => {
  it('calls today Today, whatever the hour', () => {
    expect(dayHeading(on(2026, 7, 14, 0), now)).toBe('Today');
    expect(dayHeading(on(2026, 7, 14, 23), now)).toBe('Today');
  });

  it('calls yesterday Yesterday across the midnight boundary', () => {
    // compared by calendar day, not by elapsed hours: 23:00 yesterday is closer
    // in time than 01:00 today but is still a different day
    expect(dayHeading(on(2026, 7, 13, 23), now)).toBe('Yesterday');
  });

  it('names the weekday inside the last week', () => {
    expect(dayHeading(on(2026, 7, 11), now)).toBe('Tuesday');
    expect(dayHeading(on(2026, 7, 8), now)).toBe('Saturday');
  });

  it('gives a date once a weekday would be ambiguous', () => {
    // seven days back is the same weekday as today, so the name stops placing it
    expect(dayHeading(on(2026, 7, 7), now)).toBe('7 Aug');
  });

  it('adds the year only when it is not this one', () => {
    expect(dayHeading(on(2026, 2, 3), now)).toBe('3 Mar');
    expect(dayHeading(on(2025, 11, 25), now)).toBe('25 Dec 2025');
  });

  it('does not read a turn from later today as a past day', () => {
    // clock skew and a phone that changed timezone both produce these
    expect(dayHeading(on(2026, 7, 14, 23), new Date(2026, 7, 14, 1))).toBe('Today');
  });
});
