import { openSeenStore } from '../seenStore';
import type { SeenStore } from '../seenStore';
import type { Seen } from '../timeline';

/**
 * Where sightings live, and why they stopped living in a blob.
 *
 * The store was one JSON key in AsyncStorage, capped at 1,200 rows and filtered to the
 * last 84 days on every read — so it quietly destroyed the history every habit figure
 * in this app is built from. Tested against real SQL in `:memory:`, the way the journal
 * and the chat archive are.
 */

const fresh = async (): Promise<SeenStore> => await openSeenStore(':memory:');

const sighting = (place: string, at: number, via?: 'enter' | 'exit'): Seen =>
  via ? { place, at, via } : { place, at };

describe('the sighting table', () => {
  it('keeps a sighting it is given', async () => {
    const s = await fresh();
    await s.put([sighting('Office', 1000, 'exit')]);
    expect(await s.all(10)).toEqual([sighting('Office', 1000, 'exit')]);
  });

  it('returns the newest rows when asked for fewer than it holds', async () => {
    // the render paths want a window: loadSeen runs on every screen focus and must not
    // read a year to draw one row
    const s = await fresh();
    await s.put([sighting('A', 1000), sighting('B', 2000), sighting('C', 3000)]);
    expect((await s.all(2)).map((r) => r.place)).toEqual(['B', 'C']);
  });

  it('returns rows oldest-first, because every reader assumes that', async () => {
    const s = await fresh();
    await s.put([sighting('C', 3000), sighting('A', 1000)]);
    expect((await s.all(10)).map((r) => r.at)).toEqual([1000, 3000]);
  });

  it('writes the same moment once, so a repeated save is free', async () => {
    const s = await fresh();
    await s.put([sighting('Office', 1000, 'exit')]);
    await s.put([sighting('Office', 1000, 'exit')]);
    expect(await s.held()).toBe(1);
  });

  it('reads a window by time, which is what a year of habit needs', async () => {
    const s = await fresh();
    await s.put([sighting('A', 1000), sighting('B', 5000), sighting('C', 9000)]);
    expect((await s.between(2000, 6000)).map((r) => r.place)).toEqual(['B']);
  });

  it('drops the moments it is told to and keeps the rest', async () => {
    const s = await fresh();
    await s.put([sighting('A', 1000), sighting('B', 2000)]);
    await s.drop([1000]);
    expect((await s.all(10)).map((r) => r.place)).toEqual(['B']);
  });

  it('empties on request, paired with the location switch going off', async () => {
    const s = await fresh();
    await s.put([sighting('A', 1000)]);
    await s.clear();
    expect(await s.held()).toBe(0);
  });

  it('says how much it holds and how far back, for a row that must say so', async () => {
    const s = await fresh();
    await s.put([sighting('A', 1000), sighting('B', 2000)]);
    expect(await s.held()).toBe(2);
    expect(await s.oldest()).toBe(1000);
  });

  it('has nothing to say when empty rather than throwing', async () => {
    const s = await fresh();
    expect(await s.all(10)).toEqual([]);
    expect(await s.oldest()).toBeNull();
  });

  it('leaves an app-open sighting without a via key at all', async () => {
    // `via` is tested for truthiness across the codebase, and an explicit undefined
    // round-trips differently through JSON than an absent key
    const s = await fresh();
    await s.put([sighting('Office', 1000)]);
    expect('via' in (await s.all(10))[0]).toBe(false);
  });
});
