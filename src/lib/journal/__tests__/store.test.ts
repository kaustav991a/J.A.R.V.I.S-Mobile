import { openJournal, RETENTION_MS } from '../store';
import type { Journal } from '../store';

/**
 * The local journal, tested against real SQL.
 *
 * `':memory:'` is supported by expo-sqlite's async API, so every test gets a
 * clean database with no file to clean up — and the schema, the upserts and the
 * retention are all genuinely exercised rather than mocked into agreement.
 */
const fresh = async (): Promise<Journal> => await openJournal(':memory:');

describe('the journal store', () => {
  it('keeps an event it has been given', async () => {
    const j = await fresh();
    await j.putEvents([{ at: 1000, kind: 'foreground', app: 'com.whatsapp' }]);
    expect(await j.eventsBetween(0, 2000)).toEqual([
      { at: 1000, kind: 'foreground', app: 'com.whatsapp' },
    ]);
  });

  /**
   * Collection windows overlap on purpose — a sync asks for a little before its
   * watermark so an event on the boundary is never missed. That is only safe if
   * writing the same event twice is a no-op.
   */
  it('writes the same event twice without duplicating it', async () => {
    const j = await fresh();
    const row = { at: 1000, kind: 'foreground' as const, app: 'com.whatsapp' };
    await j.putEvents([row]);
    const written = await j.putEvents([row]);
    expect(written).toBe(0);
    expect(await j.eventsBetween(0, 2000)).toHaveLength(1);
  });

  it('tells two apps apart at the same instant', async () => {
    // one leaves as the other arrives, and both carry the same timestamp
    const j = await fresh();
    await j.putEvents([
      { at: 1000, kind: 'background', app: 'com.whatsapp' },
      { at: 1000, kind: 'foreground', app: 'com.instagram.android' },
    ]);
    expect(await j.eventsBetween(0, 2000)).toHaveLength(2);
  });

  it('keeps a screen event, which belongs to no app at all', async () => {
    // `app` is null on these, and a naive composite key drops every one of them
    // after the first — SQLite does not treat two NULLs as equal, which is what
    // makes this work and also what makes it worth pinning
    const j = await fresh();
    await j.putEvents([
      { at: 1000, kind: 'unlock', app: null },
      { at: 2000, kind: 'unlock', app: null },
    ]);
    expect(await j.eventsBetween(0, 3000)).toHaveLength(2);
  });

  it('takes the newest figure for a day that is read again', async () => {
    // a day still in progress is re-read on the next sync and its total grows
    const j = await fresh();
    await j.putDaily([{ day: '2026-08-19', app: 'com.whatsapp', ms: 60_000 }]);
    await j.putDaily([{ day: '2026-08-19', app: 'com.whatsapp', ms: 95_000 }]);
    expect(await j.dailyFor('2026-08-19')).toEqual([
      { day: '2026-08-19', app: 'com.whatsapp', ms: 95_000 },
    ]);
  });

  it('remembers how far a source has been pulled', async () => {
    const j = await fresh();
    expect(await j.watermark('events')).toBeNull();
    await j.setWatermark('events', 4321);
    expect(await j.watermark('events')).toBe(4321);
  });

  it('drops events older than the retention window and keeps the rest', async () => {
    const now = 1_800_000_000_000;
    const j = await fresh();
    await j.putEvents([
      { at: now - RETENTION_MS - 1, kind: 'foreground', app: 'old.app' },
      { at: now - 1000, kind: 'foreground', app: 'new.app' },
    ]);
    expect(await j.prune(now)).toBe(1);
    const left = await j.eventsBetween(0, now);
    expect(left.map((e) => e.app)).toEqual(['new.app']);
  });

  it('reports what it is holding, so the screen can say so', async () => {
    const j = await fresh();
    await j.putEvents([{ at: 1000, kind: 'unlock', app: null }]);
    await j.putDaily([{ day: '2026-08-19', app: 'com.whatsapp', ms: 10 }]);
    expect(await j.size()).toEqual({ events: 1, daily: 1 });
  });
});
