import AsyncStorage from '@react-native-async-storage/async-storage';

import { noteSweep, sweepsToday } from '../geofence';
import { crossings, forgetCrossing, loadSeen } from '../timeline';
import type { Seen } from '../timeline';

/**
 * A window into the sighting store, because there was not one.
 *
 * *"but if sweep is silent then it will add different timings and we can't show it"* —
 * asked on 2026-09-02, an hour after the sweep notifications were silenced. The answer
 * is that a suppressed sweep writes nothing at all, and **the honest half of the answer
 * is that nobody could check that.** The only window into what the app had recorded was
 * a notification, and those had just been switched off for the wrong ones.
 *
 * So: what it kept, and how much it threw away.
 */

const at = (hour: number, minute: number) =>
  new Date(new Date().setHours(hour, minute, 0, 0)).getTime();

describe('what it kept', () => {
  /** an explicit evening, so a 7:08 PM departure is not in the future of the test run */
  const evening = new Date(new Date().setHours(20, 0, 0, 0));

  const seen: Seen[] = [
    { place: 'Home', at: at(8, 6), via: 'exit' },
    { place: 'Office', at: at(10, 3), via: 'enter' },
    { place: 'Office', at: at(12, 0) },
    { place: 'Office', at: at(19, 8), via: 'exit' },
  ];

  it('shows crossings newest first, since the last one is the one being checked', () => {
    expect(crossings(seen, evening).map((c) => c.at)).toEqual([at(19, 8), at(10, 3), at(8, 6)]);
  });

  it('leaves out app-opens, which are not crossings and never were', () => {
    // the whole point of this row is telling measured events from the old kind
    expect(crossings(seen, evening).every((c) => c.via)).toBe(true);
  });

  it('says which way each one went', () => {
    expect(crossings(seen, evening)[0]).toMatchObject({ place: 'Office', via: 'exit' });
  });

  it('holds a few, because this is a check and not a history', () => {
    const many: Seen[] = Array.from({ length: 30 }, (_, i) => ({
      place: 'Office',
      at: at(9, 0) + i * 60_000,
      via: 'exit' as const,
    }));
    expect(crossings(many, evening).length).toBeLessThanOrEqual(6);
  });

  it('has nothing to show before anything has been crossed', () => {
    expect(crossings([], evening)).toEqual([]);
  });
});

describe('what it threw away', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('counts nothing on a day with no sweep', async () => {
    expect(await sweepsToday(Date.now())).toBe(0);
  });

  it('counts each burst it recognised', async () => {
    await noteSweep(at(16, 3));
    await noteSweep(at(16, 40));
    expect(await sweepsToday(Date.now())).toBe(2);
  });

  it('forgets yesterday, so the figure is about the day being looked at', async () => {
    const yesterday = at(16, 3) - 24 * 60 * 60 * 1000;
    await noteSweep(yesterday);
    expect(await sweepsToday(Date.now())).toBe(0);
  });
});

describe('taking a crossing back', () => {
  const store = async (seen: Seen[]) => {
    await AsyncStorage.setItem('jarvis_place_seen', JSON.stringify(seen));
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('removes the one crossing and leaves the rest', async () => {
    // "Left Office, 6:12 PM" while he sat at his desk: written by a build that had no
    // drift check, and no way to take it out again. A wrong figure nobody can delete
    // is worse than a wrong figure, because it teaches a habit for twelve weeks
    await store([
      { place: 'Home', at: at(8, 6), via: 'exit' },
      { place: 'Office', at: at(18, 12), via: 'exit' },
      { place: 'Office', at: at(19, 8), via: 'exit' },
    ]);
    await forgetCrossing(at(18, 12));
    expect((await loadSeen()).map((s) => s.at)).toEqual([at(8, 6), at(19, 8)]);
  });

  it('leaves an app-open sighting that happens to share the moment', async () => {
    // only the crossing is being disowned; the app was still open at that time and
    // that much did happen
    await store([
      { place: 'Office', at: at(18, 12) },
      { place: 'Office', at: at(18, 12), via: 'exit' },
    ]);
    await forgetCrossing(at(18, 12));
    expect(await loadSeen()).toEqual([{ place: 'Office', at: at(18, 12) }]);
  });

  it('does nothing when the moment is not in the store', async () => {
    await store([{ place: 'Office', at: at(19, 8), via: 'exit' }]);
    await forgetCrossing(at(1, 0));
    expect(await loadSeen()).toHaveLength(1);
  });
});
