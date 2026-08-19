import { appLabel, say, summarise } from '../digest';
import type { DailyRow, UsageEvent } from '../store';

const daily = (app: string, ms: number): DailyRow => ({ day: '2026-08-19', app, ms });
const unlock = (at: number): UsageEvent => ({ at, kind: 'unlock', app: null });

describe('summarising a day', () => {
  it('adds the time up and ranks the apps', () => {
    const r = summarise([daily('com.whatsapp', 60_000), daily('com.instagram.android', 120_000)], []);
    if (r.state !== 'measured') throw new Error('narrowing');
    expect(r.total).toBe(180_000);
    expect(r.top[0].app).toBe('com.instagram.android');
  });

  it('names only the few that matter, not everything installed', () => {
    const r = summarise(
      ['a', 'b', 'c', 'd', 'e'].map((n, i) => daily(`com.${n}`, (i + 1) * 1000)),
      []
    );
    if (r.state !== 'measured') throw new Error('narrowing');
    expect(r.top).toHaveLength(3);
    // the total still counts everything, even what is not named
    expect(r.total).toBe(15_000);
  });

  it('counts pickups from unlocks, not from apps coming to the front', () => {
    // an app arriving in the foreground while the phone is already in your hand
    // is not a pickup, and counting those inflates the figure severalfold — in
    // the direction that sounds impressive, which is the worst direction to be
    // wrong in for a number this app will one day volunteer unprompted
    const r = summarise([daily('com.whatsapp', 10)], [unlock(1), unlock(2), { at: 3, kind: 'foreground', app: 'x' }]);
    if (r.state !== 'measured') throw new Error('narrowing');
    expect(r.pickups).toBe(2);
  });

  it('calls a day with no rows empty, which is not the same as unmeasured', () => {
    expect(summarise([], []).state).toBe('empty');
  });
});

describe('putting a reading into words', () => {
  it('names the figure and the app', () => {
    const line = say(summarise([daily('com.instagram.android', 3_600_000)], [unlock(1)]));
    expect(line).toContain('1h');
    expect(line).toContain('Instagram');
  });

  it('reads minutes as minutes below the hour', () => {
    const line = say(summarise([daily('com.whatsapp', 25 * 60_000)], []));
    expect(line).toContain('25m');
  });

  /**
   * The bug this exists to prevent, and this project has shipped it twice: a
   * silent result read as "nothing happened" when it meant "nothing was
   * measured". The briefing cost an evening; the Vitals panel sat empty against
   * a healthy machine. Usage access is revoked by hand in Settings at any
   * moment, and the app is never told.
   */
  it('says it cannot see, rather than claiming you used nothing', () => {
    const line = say({ state: 'denied' });
    expect(line).toContain('cannot see');
    expect(line).not.toContain('nothing');
  });

  it('says an empty day is empty', () => {
    expect(say({ state: 'empty' })).toContain('Nothing recorded');
  });

  it('names what failed rather than going quiet', () => {
    expect(say({ state: 'error', problem: 'SQLITE_BUSY' })).toContain('SQLITE_BUSY');
  });

  it('never exclaims, in any state', () => {
    // the same rule the briefings follow: understatement is the instrument
    const states = [
      summarise([daily('com.whatsapp', 1000)], []),
      { state: 'empty' as const },
      { state: 'denied' as const },
      { state: 'error' as const, problem: 'x' },
    ];
    for (const s of states) expect(say(s)).not.toContain('!');
  });
});

describe('naming an app', () => {
  it('uses the last meaningful part of the package name', () => {
    expect(appLabel('com.instagram.android')).toBe('Instagram');
    expect(appLabel('com.whatsapp')).toBe('Whatsapp');
  });

  it('gives back anything it cannot parse unchanged', () => {
    expect(appLabel('weirdthing')).toBe('Weirdthing');
  });

  it('survives a package name that is nothing but platform words', () => {
    expect(appLabel('android')).toBe('Android');
  });
});
