import { openJournal } from '../store';
import type { DailyRow } from '../store';
import { fakeSource } from '../source';
import type { UsageSource } from '../source';
import { FIRST_RUN_DAILY_MS, syncUsage } from '../sync';

const NOW = 1_800_000_000_000;
const fresh = () => openJournal(':memory:');

describe('syncing usage into the journal', () => {
  it('writes what it read and says how much', async () => {
    const j = await fresh();
    const s = fakeSource({ events: [{ at: NOW - 1000, kind: 'unlock', app: null }] });
    const r = await syncUsage(j, s, NOW);
    expect(r).toEqual({ state: 'ok', events: 1, daily: 0 });
    expect(await j.eventsBetween(0, NOW)).toHaveLength(1);
  });

  /**
   * The collector is allowed to be lazy because Android is the buffer: every
   * query is retroactive inside its retention window, so a missed run costs
   * nothing. That only holds if going over the same ground again is free.
   */
  it('running twice changes nothing the second time', async () => {
    const j = await fresh();
    const s = fakeSource({ events: [{ at: NOW - 1000, kind: 'unlock', app: null }] });
    await syncUsage(j, s, NOW);
    expect(await syncUsage(j, s, NOW)).toEqual({ state: 'ok', events: 0, daily: 0 });
  });

  it('reaches back a long way on a first run, and only forward after that', async () => {
    const j = await fresh();
    const asked: number[] = [];
    const spy: UsageSource = {
      ...fakeSource(),
      queryDaily: async (from: number): Promise<DailyRow[]> => {
        asked.push(from);
        return [];
      },
    };

    await syncUsage(j, spy, NOW);
    expect(NOW - asked[0]).toBe(FIRST_RUN_DAILY_MS);

    await syncUsage(j, spy, NOW + 60_000);
    // the second run starts from the watermark, not from two years ago
    expect(NOW - asked[1]).toBeLessThan(FIRST_RUN_DAILY_MS);
  });

  it('asks for slightly before the watermark, so a boundary event is not lost', async () => {
    const j = await fresh();
    const asked: number[] = [];
    const spy: UsageSource = {
      ...fakeSource(),
      queryEvents: async (from: number) => {
        asked.push(from);
        return [];
      },
    };
    await syncUsage(j, spy, NOW);
    await syncUsage(j, spy, NOW);
    // the second window starts before where the first one ended
    expect(asked[1]).toBeLessThan(NOW);
  });

  it('reports denied without touching the journal', async () => {
    const j = await fresh();
    expect(await syncUsage(j, fakeSource({ grant: 'denied' }), NOW)).toEqual({ state: 'denied' });
    expect(await j.size()).toEqual({ events: 0, daily: 0 });
  });

  it('treats an unavailable native module as denied, not as an empty day', async () => {
    const j = await fresh();
    expect(await syncUsage(j, fakeSource({ grant: 'unavailable' }), NOW)).toEqual({ state: 'denied' });
  });

  it('does not advance its watermark when the read failed', async () => {
    // otherwise one bad sync silently skips that window forever, and the gap is
    // invisible afterwards — the worst shape a data bug can take, because
    // nothing downstream can tell that something is missing
    const j = await fresh();
    const r = await syncUsage(j, fakeSource({ throws: 'native gone' }), NOW);
    expect(r).toEqual({ state: 'error', problem: 'native gone' });
    expect(await j.watermark('events')).toBeNull();
  });
});

/**
 * The device found this one, and it is a design gap rather than a slip.
 *
 * `syncUsage` has three callers by design — the Journal screen, its manual
 * button, and the background task that rides the commute briefing — and nothing
 * stopped two of them running at once. Two transactions on one database gave
 * `cannot start a transaction within a transaction`, and before that an outright
 * hang with no error at all.
 */
describe('two syncs at once', () => {
  it('runs them one after another rather than on top of each other', async () => {
    const j = await fresh();
    let inside = 0;
    let overlapped = false;
    const slow: UsageSource = {
      ...fakeSource(),
      queryEvents: async () => {
        inside += 1;
        if (inside > 1) overlapped = true;
        await new Promise((r) => setTimeout(r, 20));
        inside -= 1;
        return [];
      },
    };

    // deliberately not awaited in turn: both are in flight before either resolves
    await Promise.all([syncUsage(j, slow, NOW), syncUsage(j, slow, NOW), syncUsage(j, slow, NOW)]);

    expect(overlapped).toBe(false);
  });

  it('lets the next sync run after one of them fails', async () => {
    // a poisoned queue would be worse than the collision it replaced
    const j = await fresh();
    const bad = await syncUsage(j, fakeSource({ throws: 'native gone' }), NOW);
    expect(bad.state).toBe('error');
    const good = await syncUsage(j, fakeSource(), NOW);
    expect(good.state).toBe('ok');
  });
});
