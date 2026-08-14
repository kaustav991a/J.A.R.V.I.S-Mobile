import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_COMMUTE,
  alreadyBriefed,
  clockLabel,
  dueDeparture,
  hourLabel,
  loadCommute,
  markBriefed,
  saveCommute,
} from '../commute';
import type { CommuteSettings } from '../commute';

/**
 * The clock labels, the day mask, and which door is due.
 *
 * These exist because a briefing set for 8 PM was stored as hour 8. The stepper,
 * the row on the Places screen and the notification body all agreed with each
 * other in 24-hour digits, so nothing contradicted the mistake until the briefing
 * failed to arrive twelve hours after it had quietly already been due.
 */

const at = (placeId: string, hour: number, minute = 0): CommuteSettings => ({
  ...DEFAULT_COMMUTE,
  departures: DEFAULT_COMMUTE.departures.map((d) =>
    d.placeId === placeId ? { ...d, on: true, hour, minute } : { ...d, on: false }
  ),
});

/** a Friday and a Saturday, so the day mask is what decides */
const friday = (hour: number, minute = 0) => new Date(2026, 7, 14, hour, minute);
const saturday = (hour: number, minute = 0) => new Date(2026, 7, 15, hour, minute);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('clockLabel', () => {
  it('separates eight in the morning from eight at night', () => {
    // the whole bug in one assertion
    expect(clockLabel(8, 0)).toBe('8:00 AM');
    expect(clockLabel(20, 0)).toBe('8:00 PM');
  });

  it('calls midnight 12 AM and noon 12 PM, not 0', () => {
    expect(clockLabel(0, 15)).toBe('12:15 AM');
    expect(clockLabel(12, 15)).toBe('12:15 PM');
  });

  it('pads the minutes', () => {
    expect(clockLabel(9, 5)).toBe('9:05 AM');
  });
});

describe('hourLabel', () => {
  it('carries the meridiem on both ends of a window that shares one', () => {
    // "08:00–11:00" was the label that failed to warn him; the redundancy here is
    // deliberate, not an oversight
    expect(`${hourLabel(8)}–${hourLabel(11)}`).toBe('8 AM–11 AM');
  });

  it('spans noon and midnight without wrapping to 0', () => {
    expect(`${hourLabel(11)}–${hourLabel(14)}`).toBe('11 AM–2 PM');
    expect(`${hourLabel(23)}–${hourLabel(2)}`).toBe('11 PM–2 AM');
  });
});

describe('dueDeparture', () => {
  it('is silent at 8 PM when the hour was stored as 8', () => {
    // the reported failure, pinned: at 20:00 an 08:00 briefing is twelve hours
    // past its window and correctly says nothing
    expect(dueDeparture(friday(20), at('home', 8))).toBeNull();
  });

  it('is due at 8 PM when the hour was stored as 20', () => {
    expect(dueDeparture(friday(20), at('home', 20))?.placeId).toBe('home');
  });

  it('picks the office at 7 PM and home at 8 AM on the same settings', () => {
    // the reason a departure is a list: both are on, and each has to win its own
    // hour without the other interfering
    const both: CommuteSettings = {
      ...DEFAULT_COMMUTE,
      departures: [
        { placeId: 'home', label: 'Home', on: true, hour: 8, minute: 0 },
        { placeId: 'office', label: 'Office', on: true, hour: 19, minute: 0 },
      ],
    };
    expect(dueDeparture(friday(8), both)?.placeId).toBe('home');
    expect(dueDeparture(friday(19), both)?.placeId).toBe('office');
    expect(dueDeparture(friday(14), both)).toBeNull();
  });

  it('opens half an hour early and closes half an hour late', () => {
    const s = at('office', 19);
    expect(dueDeparture(friday(18, 30), s)).not.toBeNull();
    expect(dueDeparture(friday(19, 30), s)).not.toBeNull();
    expect(dueDeparture(friday(18, 29), s)).toBeNull();
    expect(dueDeparture(friday(19, 31), s)).toBeNull();
  });

  it('says nothing on a Saturday by default', () => {
    expect(dueDeparture(saturday(8), at('home', 8))).toBeNull();
  });

  it('runs on a Saturday that has been switched on, leaving Sunday off', () => {
    // the special case he asked for: a worked Saturday must not drag Sunday with it
    const s = { ...at('home', 8), days: [false, true, true, true, true, true, true] };
    expect(dueDeparture(saturday(8), s)?.placeId).toBe('home');
    expect(dueDeparture(new Date(2026, 7, 16, 8), s)).toBeNull();
  });

  it('ignores a departure that is switched off', () => {
    expect(dueDeparture(friday(8), { ...at('home', 8), departures: DEFAULT_COMMUTE.departures })).toBeNull();
  });
});

describe('alreadyBriefed', () => {
  it('does not let the morning briefing silence the evening one', () => {
    // a single day-stamp was enough while there was one time; with two it would
    // look exactly like the evening briefing being broken, and only ever after the
    // morning had worked
    return markBriefed('home', '2026-08-14').then(async () => {
      expect(await alreadyBriefed('home', '2026-08-14')).toBe(true);
      expect(await alreadyBriefed('office', '2026-08-14')).toBe(false);
    });
  });

  it('forgets yesterday', async () => {
    await markBriefed('home', '2026-08-13');
    expect(await alreadyBriefed('home', '2026-08-14')).toBe(false);
  });

  it('treats the pre-departures value as not yet briefed', async () => {
    // the old shape was a bare `YYYY-MM-DD` string, which does not parse as JSON —
    // at worst one extra briefing arrives on the day of the upgrade
    await AsyncStorage.setItem('jarvis_commute_sent', '2026-08-14');
    expect(await alreadyBriefed('home', '2026-08-14')).toBe(false);
  });
});

describe('loadCommute', () => {
  it('carries a stored single time over to the departure from home', async () => {
    // dropping it would make the feature look like it forgot on an app update
    await AsyncStorage.setItem(
      'jarvis_commute',
      JSON.stringify({ on: true, hour: 8, minute: 30, weekdaysOnly: true })
    );
    const s = await loadCommute();
    const home = s.departures.find((d) => d.placeId === 'home');
    expect(home).toMatchObject({ on: true, hour: 8, minute: 30 });
    expect(s.departures.find((d) => d.placeId === 'office')?.on).toBe(false);
    expect(s.days).toEqual([false, true, true, true, true, true, false]);
  });

  it('reads a legacy every-day setting as all seven days', async () => {
    await AsyncStorage.setItem('jarvis_commute', JSON.stringify({ on: true, hour: 9, weekdaysOnly: false }));
    expect((await loadCommute()).days).toEqual([true, true, true, true, true, true, true]);
  });

  it('round-trips both departures and a worked Saturday', async () => {
    const s: CommuteSettings = {
      departures: [
        { placeId: 'home', label: 'Home', on: true, hour: 8, minute: 0 },
        { placeId: 'office', label: 'Office', on: true, hour: 19, minute: 0 },
      ],
      days: [false, true, true, true, true, true, true],
    };
    await saveCommute(s);
    expect(await loadCommute()).toEqual(s);
  });

  it('replaces a short day array rather than indexing off the end of it', async () => {
    // a missing day indexes to undefined, which is falsy — a briefing switched off
    // by a storage bug, which is the exact class of failure this feature keeps
    // having
    await AsyncStorage.setItem('jarvis_commute', JSON.stringify({ departures: [], days: [true, true] }));
    expect((await loadCommute()).days).toHaveLength(7);
  });

  it('falls back to the defaults on unreadable storage', async () => {
    await AsyncStorage.setItem('jarvis_commute', 'not json');
    expect(await loadCommute()).toEqual(DEFAULT_COMMUTE);
  });
});
