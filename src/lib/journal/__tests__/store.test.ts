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
    const j = await fresh();
    await j.putEvents([
      { at: 1000, kind: 'unlock', app: null },
      { at: 2000, kind: 'unlock', app: null },
    ]);
    const rows = await j.eventsBetween(0, 3000);
    expect(rows).toHaveLength(2);
    // and it comes back with no app, not with the sentinel the column holds
    expect(rows[0].app).toBeNull();
  });

  /**
   * The bug the sync tests caught and this file originally missed.
   *
   * SQLite treats two NULLs as DISTINCT inside a primary key, so while `app` was
   * nullable an unlock re-inserted itself on every overlapping sync — one copy
   * per run, forever, and the pickup count climbing with the number of times the
   * app happened to be opened. The first version of this test used two different
   * timestamps and sailed straight past it.
   */
  it('does not duplicate an app-less event when the same window is read again', async () => {
    const j = await fresh();
    const row = { at: 1000, kind: 'unlock' as const, app: null };
    await j.putEvents([row]);
    expect(await j.putEvents([row])).toBe(0);
    expect(await j.eventsBetween(0, 2000)).toHaveLength(1);
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

  /**
   * A first sync is a week of events, and that is not a handful of rows.
   *
   * Measured on the device: 5,250 rows in and still climbing minutes later,
   * because `putEvents` was a bare `runAsync` per row — a bridge round-trip and
   * its own implicit transaction each time, so every row cost a commit and an
   * fsync. In-process SQLite makes the same loop instant, which is exactly why
   * no test caught it and the phone did.
   *
   * This pins the volume, not the speed: a timing assertion here would measure
   * the machine running it. What it guarantees is that the batched path stays
   * correct at a realistic size.
   */
  it('takes a week of events in one call, without losing or duplicating any', async () => {
    const j = await fresh();
    const week = Array.from({ length: 5000 }, (_, i) => ({
      at: 1_700_000_000_000 + i * 1000,
      kind: i % 2 === 0 ? ('foreground' as const) : ('background' as const),
      app: `com.app${i % 40}`,
    }));
    expect(await j.putEvents(week)).toBe(5000);
    // and the same week again, which is what an overlapping window sends
    expect(await j.putEvents(week)).toBe(0);
    expect((await j.size()).events).toBe(5000);
  });

  it('reports what it is holding, so the screen can say so', async () => {
    const j = await fresh();
    await j.putEvents([{ at: 1000, kind: 'unlock', app: null }]);
    await j.putDaily([{ day: '2026-08-19', app: 'com.whatsapp', ms: 10 }]);
    expect(await j.size()).toEqual({ events: 1, daily: 1 });
  });
});

/**
 * One connection per file, for the life of the process.
 *
 * The screen, the background task and the manual button each opened their own
 * connection to the same database. Two of those mid-transaction is how the
 * device produced `cannot start a transaction within a transaction`.
 */
describe('opening the journal more than once', () => {
  it('hands the same connection back for the same file', async () => {
    const a = await openJournal('shared-test.db');
    const b = await openJournal('shared-test.db');
    expect(a).toBe(b);
  });

  it('never shares an in-memory database, because every test wants an empty one', async () => {
    const a = await openJournal(':memory:');
    const b = await openJournal(':memory:');
    expect(a).not.toBe(b);
    await a.putEvents([{ at: 1, kind: 'unlock', app: null }]);
    expect((await b.size()).events).toBe(0);
  });
});

/**
 * The aggregate reads the recall layer sits on.
 *
 * Deliberately SQL rather than pulling rows into JS: a week is roughly 17,000
 * events on this phone, and counting them in the app would mean carrying all of
 * them across the bridge to produce three numbers.
 */
describe('rolling the journal up', () => {
  const seed = async () => {
    const j = await fresh();
    await j.putDaily([
      { day: '2026-08-17', app: 'com.whatsapp', ms: 60_000 },
      { day: '2026-08-17', app: 'com.google.android.gm', ms: 120_000 },
      { day: '2026-08-18', app: 'com.whatsapp', ms: 30_000 },
      { day: '2026-08-19', app: 'com.google.android.gm', ms: 90_000 },
    ]);
    return j;
  };

  it('totals each day across every app', async () => {
    const j = await seed();
    expect(await j.msByDay('2026-08-17', '2026-08-19')).toEqual([
      { day: '2026-08-17', ms: 180_000 },
      { day: '2026-08-18', ms: 30_000 },
      { day: '2026-08-19', ms: 90_000 },
    ]);
  });

  it('honours the window rather than totalling everything it holds', async () => {
    const j = await seed();
    expect(await j.msByDay('2026-08-18', '2026-08-19')).toHaveLength(2);
  });

  it('ranks apps across a span, not within one day', async () => {
    const j = await seed();
    expect(await j.appTotals('2026-08-17', '2026-08-19', 2)).toEqual([
      { app: 'com.google.android.gm', ms: 210_000 },
      { app: 'com.whatsapp', ms: 90_000 },
    ]);
  });

  it('returns only the timestamps of one kind, so pickups can be counted cheaply', async () => {
    const j = await fresh();
    await j.putEvents([
      { at: 1000, kind: 'unlock', app: null },
      { at: 2000, kind: 'foreground', app: 'com.whatsapp' },
      { at: 3000, kind: 'unlock', app: null },
      { at: 9000, kind: 'unlock', app: null },
    ]);
    expect(await j.timesOfKind('unlock', 0, 5000)).toEqual([1000, 3000]);
  });
});
