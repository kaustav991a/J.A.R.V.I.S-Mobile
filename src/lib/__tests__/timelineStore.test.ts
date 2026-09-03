import AsyncStorage from '@react-native-async-storage/async-storage';

import { openSeenStore } from '../seenStore';
import { forgetSeen, loadSeen, noteSeen, useSeenStore } from '../timeline';

/**
 * `timeline.ts` against a real table.
 *
 * The six I/O functions moved from one AsyncStorage blob to SQLite; every signature
 * above them is unchanged, so these are the tests that say the move happened and that
 * the eighty-four-day cutoff — the line that destroyed history — is gone.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
  useSeenStore(await openSeenStore(':memory:'));
});

afterEach(() => useSeenStore(null));

const DAY = 24 * 60 * 60 * 1000;

it('keeps a crossing it is told about', async () => {
  await noteSeen('Office', 1_000_000, 'exit');
  expect(await loadSeen()).toEqual([{ place: 'Office', at: 1_000_000, via: 'exit' }]);
});

it('still has a sighting from a year ago', async () => {
  // the whole reason for this change. The blob filtered to 84 days on every read, so
  // "you usually leave at seven" rested on twelve weeks and a Timeline export of
  // seventeen months would have been thrown away as it arrived
  const now = Date.now();
  await noteSeen('Home', now - 365 * DAY, 'exit');
  const seen = await loadSeen();
  expect(seen).toHaveLength(1);
  expect(seen[0].at).toBe(now - 365 * DAY);
});

it('writes the same crossing once however often the platform delivers it', async () => {
  await noteSeen('Office', 1_000_000, 'exit');
  await noteSeen('Office', 1_030_000, 'exit');
  expect(await loadSeen()).toHaveLength(1);
});

it('collapses two app-opens at one place in the same visit', async () => {
  await noteSeen('Office', 1_000_000);
  await noteSeen('Office', 1_060_000);
  expect(await loadSeen()).toHaveLength(1);
});

it('empties out when told to forget', async () => {
  await noteSeen('Office', 1_000_000, 'exit');
  await forgetSeen();
  expect(await loadSeen()).toEqual([]);
});
