import AsyncStorage from '@react-native-async-storage/async-storage';

import { openSeenStore } from '../seenStore';
import {
  forgetSeen,
  loadSeen,
  noteSeen,
  seenSince,
  storeHeld,
  useSeenStore,
} from '../timeline';

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

it('reads further back than the render window when asked', async () => {
  const now = Date.now();
  await noteSeen('Home', now - 200 * DAY, 'exit');
  await noteSeen('Office', now - DAY, 'exit');
  expect(await seenSince(365)).toHaveLength(2);
  expect(await seenSince(30)).toHaveLength(1);
});

it('has nothing to read back when there is no store', async () => {
  useSeenStore(null);
  // the real database is not open in a test, so this is the failure path, and a
  // habit figure with no history is a habit figure that says nothing
  expect(await seenSince(365)).toEqual([]);
});

it('says how much it holds and how far back', async () => {
  const now = Date.now();
  await noteSeen('Home', now - 100 * DAY, 'exit');
  await noteSeen('Office', now - DAY, 'exit');
  expect(await storeHeld()).toEqual({ rows: 2, days: 100 });
});

it('says nothing rather than nulls when the store is empty', async () => {
  // a migration nobody can see is a migration nobody can trust, and "the import found
  // nothing" must never look like "the store is empty"
  expect(await storeHeld()).toEqual({ rows: 0, days: 0 });
});
