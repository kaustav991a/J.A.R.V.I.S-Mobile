import { appLabel, say, summarise, syncLine } from '../digest';
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

/**
 * The first real digest off the phone read:
 *
 *     5h 13m on the phone, sir, across 34 pickups. Gm 2h 12m, Pesam 1h 25m, Katana 26m.
 *
 * Gmail, eFootball and Facebook. The figures were right and the line was
 * unreadable, which is the whole reason the journal now keeps what Android
 * actually calls each package.
 */
describe('naming an app the way its owner would', () => {
  const known = {
    'com.google.android.gm': 'Gmail',
    'jp.konami.pesam': 'eFootball',
    'com.facebook.katana': 'Facebook',
  };

  it('prefers the name Android gives it', () => {
    expect(appLabel('com.google.android.gm', known)).toBe('Gmail');
    expect(appLabel('com.facebook.katana', known)).toBe('Facebook');
    expect(appLabel('jp.konami.pesam', known)).toBe('eFootball');
  });

  it('falls back to the guess for a package nothing ever named', () => {
    // uninstalled before it was ever seen: a bad name beats no name
    expect(appLabel('com.whatsapp', known)).toBe('Whatsapp');
  });

  it('ignores a label that is only the package name repeated back', () => {
    // that is what the native side returns for an app no longer installed, and
    // taking it literally would print the raw package where a guess reads better
    expect(appLabel('com.miui.player', { 'com.miui.player': 'com.miui.player' })).toBe('Player');
  });

  it('carries the real names into the spoken line', () => {
    const line = say(summarise([daily('com.facebook.katana', 3_600_000)], [unlock(1)]), known);
    expect(line).toContain('Facebook');
    expect(line).not.toContain('Katana');
  });
});

/**
 * A working button that looked broken.
 *
 * Reported from the device: tapping **Sync now** a minute after the screen had
 * already synced changed no counts. That was correct — there was genuinely
 * nothing new — but the screen said nothing, so the honest outcome and a dead
 * button were indistinguishable. The next tap added five, which is how it was
 * eventually established that the first tap had worked.
 */
describe('saying what the last sync did', () => {
  const at = new Date(2026, 7, 19, 12, 50).getTime();

  it('names what was added, when there was something', () => {
    const line = syncLine({ state: 'ok', events: 5, daily: 24 }, at);
    expect(line).toContain('12:50 PM');
    expect(line).toContain('5 new moments');
  });

  it('says one moment rather than 1 moments', () => {
    expect(syncLine({ state: 'ok', events: 1, daily: 0 }, at)).toContain('1 new moment.');
  });

  /**
   * The whole point. Nothing new is a real answer and has to look like one.
   */
  it('says nothing was new, rather than saying nothing at all', () => {
    const line = syncLine({ state: 'ok', events: 0, daily: 24 }, at);
    expect(line).toContain('Nothing new');
    expect(line).toContain('12:50 PM');
  });

  it('never reports day totals as new, because an unchanged upsert still counts', () => {
    // `daily` is rows touched, not rows added — surfacing it as new would be a
    // number that can never read zero, which is worse than no number
    const line = syncLine({ state: 'ok', events: 0, daily: 24 }, at);
    expect(line).not.toContain('24');
  });

  it('keeps saying it cannot see when the permission is gone', () => {
    expect(syncLine({ state: 'denied' }, at)).toContain('cannot see');
  });

  it('names a failure and when it happened', () => {
    const line = syncLine({ state: 'error', problem: 'database is locked' }, at);
    expect(line).toContain('database is locked');
    expect(line).toContain('12:50 PM');
  });

  it('admits it has not run yet rather than implying an empty result', () => {
    expect(syncLine(null, null)).toContain('Not synced yet');
  });
});
