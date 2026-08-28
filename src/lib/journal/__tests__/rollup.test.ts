import { openJournal } from '../store';
import type { Journal } from '../store';
import { appDeltas, rollup, startOfDay, usageForAsk, WINDOW_DAYS } from '../rollup';

/**
 * The read side of the recall layer.
 *
 * The screen shows this, the ask envelope carries a trimmed version of it, and
 * the facts sent to the gateway are derived from it — so a mistake here is a
 * mistake J.A.R.V.I.S. repeats out loud in three different places.
 */

/** a fixed Wednesday, so "today" and the six days before it are stable */
const NOW = new Date(2026, 7, 19, 18, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;
const dayOf = (back: number) => {
  const d = new Date(NOW - back * DAY);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const fresh = (): Promise<Journal> => openJournal(':memory:');

describe('rolling the journal up', () => {
  it('has nothing to say when nothing has been collected', async () => {
    // null, not a zeroed shape: "no time on his phone" and "the journal is empty"
    // are different claims and the second must never pass as the first
    expect(await rollup(await fresh(), NOW)).toBeNull();
  });

  it('separates today from the days before it', async () => {
    const j = await fresh();
    await j.putDaily([
      { day: dayOf(0), app: 'com.whatsapp', ms: 60_000 },
      { day: dayOf(1), app: 'com.whatsapp', ms: 120_000 },
      { day: dayOf(2), app: 'com.whatsapp', ms: 180_000 },
    ]);
    const r = await rollup(j, NOW);
    if (!r) throw new Error('narrowing');
    expect(r.today.ms).toBe(60_000);
    expect(r.usual.days).toBe(2);
    expect(r.usual.avgMs).toBe(150_000);
  });

  /**
   * Today is a partial day. Averaging it into its own baseline would drag the
   * comparison down all morning, so every reading before evening would say
   * "lighter than usual" — an assistant confidently wrong about you daily.
   */
  it('leaves today out of the average it is compared against', async () => {
    const j = await fresh();
    await j.putDaily([
      { day: dayOf(0), app: 'a', ms: 10_000 },
      { day: dayOf(1), app: 'a', ms: 100_000 },
    ]);
    const r = await rollup(j, NOW);
    expect(r?.usual.avgMs).toBe(100_000);
    expect(r?.vsUsual).toBe(-90_000);
  });

  it('claims no comparison at all on the first day', async () => {
    // one sample is not a baseline, and inventing one would be the assistant
    // asserting a habit it has watched exactly once
    const j = await fresh();
    await j.putDaily([{ day: dayOf(0), app: 'a', ms: 10_000 }]);
    const r = await rollup(j, NOW);
    expect(r?.usual.days).toBe(0);
    expect(r?.vsUsual).toBe(0);
  });

  it('looks back a week and no further', async () => {
    const j = await fresh();
    await j.putDaily([
      { day: dayOf(0), app: 'a', ms: 1000 },
      { day: dayOf(WINDOW_DAYS - 1), app: 'a', ms: 1000 },
      { day: dayOf(WINDOW_DAYS + 3), app: 'a', ms: 999_000 },
    ]);
    const r = await rollup(j, NOW);
    expect(r?.days).toBe(WINDOW_DAYS === 7 ? 2 : r?.days);
    expect(r?.usual.avgMs).toBe(1000);
  });

  it('counts today pickups from midnight, not from a rolling day', async () => {
    const j = await fresh();
    await j.putDaily([{ day: dayOf(0), app: 'a', ms: 1000 }]);
    await j.putEvents([
      // yesterday evening, which is not today however recent it feels
      { at: startOfDay(NOW) - 60_000, kind: 'unlock', app: null },
      { at: startOfDay(NOW) + 60_000, kind: 'unlock', app: null },
      { at: startOfDay(NOW) + 120_000, kind: 'unlock', app: null },
    ]);
    const r = await rollup(j, NOW);
    expect(r?.today.pickups).toBe(2);
  });

  it('averages the earlier days pickups without today in them', async () => {
    const j = await fresh();
    await j.putDaily([
      { day: dayOf(0), app: 'a', ms: 1000 },
      { day: dayOf(1), app: 'a', ms: 1000 },
      { day: dayOf(2), app: 'a', ms: 1000 },
    ]);
    await j.putEvents([
      { at: startOfDay(NOW) + 1000, kind: 'unlock', app: null },
      { at: startOfDay(NOW) - 1 * DAY, kind: 'unlock', app: null },
      { at: startOfDay(NOW) - 1 * DAY + 1000, kind: 'unlock', app: null },
      { at: startOfDay(NOW) - 2 * DAY, kind: 'unlock', app: null },
      { at: startOfDay(NOW) - 2 * DAY + 1000, kind: 'unlock', app: null },
    ]);
    const r = await rollup(j, NOW);
    expect(r?.today.pickups).toBe(1);
    // four unlocks across the two earlier days
    expect(r?.usual.avgPickups).toBe(2);
  });

  it('ranks the apps of today and of the week separately', async () => {
    const j = await fresh();
    await j.putDaily([
      { day: dayOf(0), app: 'today.heavy', ms: 50_000 },
      { day: dayOf(0), app: 'week.heavy', ms: 10_000 },
      { day: dayOf(1), app: 'week.heavy', ms: 900_000 },
    ]);
    const r = await rollup(j, NOW);
    expect(r?.today.top[0].app).toBe('today.heavy');
    expect(r?.usual.top[0].app).toBe('week.heavy');
  });
});

describe('what rides on every question', () => {
  it('sends minutes and real names, because a model reads this', async () => {
    const j = await fresh();
    await j.putDaily([
      { day: dayOf(0), app: 'com.google.android.gm', ms: 3_600_000 },
      { day: dayOf(1), app: 'com.google.android.gm', ms: 7_200_000 },
    ]);
    await j.putLabels({ 'com.google.android.gm': 'Gmail' });
    await j.putEvents([{ at: startOfDay(NOW) + 1000, kind: 'unlock', app: null }]);

    const u = await usageForAsk(j, NOW);
    // `usualPickups` since 2026-08-21: `rollup` always computed it and this dropped it,
    // so a fidgety day was invisible to everything above
    expect(u).toEqual({ today: 60, pickups: 1, top: ['Gmail'], usual: 120, usualPickups: 0, days: 1 });
  });

  it('says there is no usual yet rather than sending a zero', async () => {
    // a zero baseline would invite "far more than usual" about a person the
    // journal has watched for exactly one day
    const j = await fresh();
    await j.putDaily([{ day: dayOf(0), app: 'a', ms: 60_000 }]);
    const u = await usageForAsk(j, NOW);
    expect(u?.usual).toBeNull();
    expect(u?.days).toBe(0);
  });

  it('carries nothing at all when the journal is empty', async () => {
    expect(await usageForAsk(await fresh(), NOW)).toBeNull();
  });
});

/**
 * One app against its own usual, rather than a day against its own usual.
 *
 * "4h on the phone today" is a fact nobody can act on; "2h 40m in Instagram against a
 * usual 50m" names the thing that moved. The journal has held per-app days all along
 * and nothing read them this way — `usageForAsk` reports today's heaviest apps with
 * no baseline beside them, which is a list, not a comparison.
 */
describe('an app against its own usual', () => {
  const load = async (j: Journal, app: string, perDay: number[]) => {
    await j.putDaily(perDay.map((ms, back) => ({ day: dayOf(back), app, ms })));
  };

  it('has nothing to say on the first day, when there is no usual', async () => {
    const j = await fresh();
    await load(j, 'com.instagram.android', [60 * 60_000]);
    expect(await appDeltas(j, NOW)).toEqual([]);
  });

  it('measures today against the completed days, today excluded', async () => {
    const j = await fresh();
    // 160m today; 40m, 40m, 40m before it
    await load(j, 'com.instagram.android', [160 * 60_000, 40 * 60_000, 40 * 60_000, 40 * 60_000]);
    const [top] = await appDeltas(j, NOW);
    expect(top.today).toBe(160);
    expect(top.usual).toBe(40);
    expect(top.days).toBe(3);
  });

  it('names the app the way a person does, not the way the package does', async () => {
    const j = await fresh();
    await load(j, 'com.instagram.android', [160 * 60_000, 40 * 60_000, 40 * 60_000, 40 * 60_000]);
    await j.putLabels({ 'com.instagram.android': 'Instagram' });
    expect((await appDeltas(j, NOW))[0].app).toBe('Instagram');
  });

  it('puts the app that moved most first, not the app that is simply biggest', async () => {
    const j = await fresh();
    // the browser is heavier in absolute terms and entirely ordinary
    await load(j, 'com.android.chrome', [200 * 60_000, 190 * 60_000, 200 * 60_000, 210 * 60_000]);
    await load(j, 'com.instagram.android', [160 * 60_000, 40 * 60_000, 40 * 60_000, 40 * 60_000]);
    // 'Instagram' rather than the package: appLabel prettifies one even with no
    // label stored, so the assertion is about the ORDER, not the naming
    expect((await appDeltas(j, NOW))[0].app).toBe('Instagram');
  });

  it('leaves an app alone when today is ordinary for it', async () => {
    const j = await fresh();
    await load(j, 'com.android.chrome', [200 * 60_000, 190 * 60_000, 200 * 60_000, 210 * 60_000]);
    expect(await appDeltas(j, NOW)).toEqual([]);
  });

  it('ignores a heavy day on an app that is usually nothing at all', async () => {
    // a 12-minute app tripling is arithmetic, not an observation
    const j = await fresh();
    await load(j, 'com.example.rare', [12 * 60_000, 2 * 60_000, 2 * 60_000, 2 * 60_000]);
    expect(await appDeltas(j, NOW)).toEqual([]);
  });
});
