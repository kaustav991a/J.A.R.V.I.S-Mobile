import { QUIET_FROM_H, QUIET_UNTIL_H, anticipate } from '../anticipate';
import type { Observations } from '../anticipate';

/**
 * Noticing something before being asked.
 *
 * Asked for repeatedly on 2026-08-21. Built from what the phone already holds — the
 * journal's `today` against `usual`, the commute schedule, the named place — because
 * that needs no new permission and no weeks of waiting.
 *
 * **The judgement of WHETHER to speak is made here, in code.** That sentence is
 * lifted from the gateway's own nudge, where it was a lie: the decision there was a
 * substring match, and on the morning of the 21st it told him about a Saturday shift
 * that did not exist. Nothing below asks a model anything.
 */
const at = (h: number, m = 0) => new Date(2026, 7, 21, h, m);

const seen = (over: Partial<Observations> = {}): Observations => ({
  now: at(12),
  usage: null,
  pickups: null,
  departure: null,
  place: null,
  stillHereLate: false,
  goneBy: null,
  topApp: null,
  early: null,
  absent: null,
  left: null,
  elsewhere: null,
  schedule: null,
  spokenBefore: null,
  ...over,
});

describe('most of the time, he says nothing', () => {
  it('is silent when nothing is worth saying', () => {
    expect(anticipate(seen())).toBeNull();
  });

  it('is silent on an ordinary day of screen time', () => {
    expect(anticipate(seen({ usage: { today: 90, usual: 100, days: 9 } }))).toBeNull();
  });

  it('is silent outside the hours anyone wants remarking on', () => {
    const loud = { usage: { today: 400, usual: 100, days: 9 } };
    expect(anticipate(seen({ ...loud, now: at(QUIET_FROM_H - 1) }))).toBeNull();
    expect(anticipate(seen({ ...loud, now: at(QUIET_UNTIL_H + 1) }))).toBeNull();
  });

  it('is silent once he has already spoken today', () => {
    expect(
      anticipate(
        seen({
          usage: { today: 400, usual: 100, days: 9 },
          spokenBefore: { day: '2026-08-21', about: 'anything', said: { anything: '2026-08-21' } },
        })
      )
    ).toBeNull();
  });

  it('is silent rather than repeat the subject he used last time', () => {
    // one a day is not enough on its own: the same observation two days running is
    // how a remark becomes a nag
    expect(
      anticipate(
        seen({
          usage: { today: 400, usual: 100, days: 9 },
          spokenBefore: { day: '2026-08-20', about: 'usage', said: { usage: '2026-08-20' } },
        })
      )
    ).toBeNull();
  });
});

describe('a departure that is nearly here', () => {
  /**
   * Silent, and withdrawn on the day it was built.
   *
   * A countdown to a leaving time says nothing: the time is one the user typed into
   * the Places screen, so counting down to it recites their own setting, and the
   * situation line directly above already prints it. Reported within the hour as
   * "why this?", and the report was right.
   *
   * The observation is still passed in, for the day something makes it worth a
   * remark — being still at Office when he has usually left by now would qualify.
   */
  it('is not remarked on, because a countdown to your own setting is not a finding', () => {
    expect(
      anticipate(
        seen({ now: at(18, 45), departure: { label: 'Office', hour: 19, minute: 0 }, place: 'Office' })
      )
    ).toBeNull();
  });

  it('does not suppress the screen-time remark either', () => {
    // withdrawing it must not silence the one trigger that does say something
    const said = anticipate(
      seen({
        now: at(18, 45),
        departure: { label: 'Office', hour: 19, minute: 0 },
        usage: { today: 400, usual: 100, days: 9 },
      })
    );
    expect(said?.about).toBe('usage');
  });
});

/**
 * Still somewhere you are usually gone from.
 *
 * The one remark worth making, and the reason: it is not a setting you typed, it is
 * not printed on any screen, and it carries a figure you can disagree with. The
 * withdrawn leaving-time countdown failed all three.
 */
describe('still at a place you are usually gone from', () => {
  const late = seen({
    now: at(19, 40),
    place: 'Office',
    stillHereLate: true,
    goneBy: 18 * 60 + 40,
  });

  it('is named, with the hour you are usually gone by', () => {
    const said = anticipate(late);
    expect(said?.about).toBe('place');
    expect(said?.line).toContain('Office');
    // the figure, so a wrong estimate is arguable rather than authoritative
    expect(said?.line).toMatch(/6:40|18:40/);
  });

  it('outranks the screen-time remark, being about right now', () => {
    const said = anticipate({ ...late, usage: { today: 400, usual: 100, days: 9 } });
    expect(said?.about).toBe('place');
  });

  it('says nothing when you are not late', () => {
    expect(anticipate({ ...late, stillHereLate: false })).toBeNull();
  });

  it('says nothing without a figure to quote', () => {
    // `stillHereLate` cannot be true without a baseline, but a remark that cannot
    // name its own basis is exactly what this whole feature refuses to make
    expect(anticipate({ ...late, goneBy: null })).toBeNull();
  });

  it('says nothing when it does not know where you are', () => {
    expect(anticipate({ ...late, place: null })).toBeNull();
  });
});
describe('a day well past his own usual', () => {
  const heavy = seen({ usage: { today: 240, usual: 120, days: 9 } });

  it('is named, with the figure that makes it arguable', () => {
    const said = anticipate(heavy);
    expect(said?.about).toBe('usage');
    // the figure comes first, so it can be disagreed with — the same rule the
    // briefing follows. An unfalsifiable "you are on your phone a lot" is worthless
    expect(said?.line).toMatch(/\b4h\b|\b240\b|\b2h\b/);
  });

  it('waits for enough days before calling anything unusual', () => {
    // "unusual" against two days of history is not a finding, it is noise
    expect(anticipate({ ...heavy, usage: { today: 240, usual: 120, days: 2 } })).toBeNull();
  });

  it('says nothing when today is merely a little above', () => {
    expect(anticipate({ ...heavy, usage: { today: 130, usual: 120, days: 9 } })).toBeNull();
  });
});

describe('the voice', () => {
  it('spends `sir` exactly once, wherever it speaks', () => {
    const lines = [anticipate(seen({ usage: { today: 240, usual: 120, days: 9 } }))];
    for (const said of lines) {
      expect(said).not.toBeNull();
      expect(said!.line.match(/\bsir\b/gi) ?? []).toHaveLength(1);
      expect(said!.line).not.toContain('!');
    }
  });
});

/**
 * A fidgety day, which a total of minutes hides completely.
 */
describe('a day of unusually many pickups', () => {
  const fidgety = seen({ pickups: { today: 120, usual: 45, days: 9 } });

  it('is named, with both figures', () => {
    const said = anticipate(fidgety);
    expect(said?.about).toBe('pickups');
    expect(said?.line).toContain('120');
    expect(said?.line).toContain('45');
  });

  it('loses to the screen-time remark, which is the bigger fact about a day', () => {
    const said = anticipate({ ...fidgety, usage: { today: 400, usual: 100, days: 9 } });
    expect(said?.about).toBe('usage');
  });

  it('waits for a baseline like everything else here', () => {
    expect(anticipate({ ...fidgety, pickups: { today: 120, usual: 45, days: 2 } })).toBeNull();
  });

  it('says nothing about twice a very quiet day', () => {
    expect(anticipate({ ...fidgety, pickups: { today: 20, usual: 8, days: 9 } })).toBeNull();
  });

});

/**
 * The budget, which is what actually limits how much this can notice.
 *
 * One remark a day and one remembered subject was the shape until 2026-08-28, and
 * with it every new trigger made the app *less* likely to say the useful thing — a
 * dull observation spends the day exactly as fast as a sharp one. A day per subject
 * is what lets the list grow.
 */
describe('what may be said, and how often', () => {
  const heavy = { usage: { today: 400, usual: 100, days: 9 } };

  it('stays silent on a subject it used yesterday', () => {
    expect(
      anticipate(seen({ ...heavy, spokenBefore: { day: '2026-08-20', about: 'usage', said: { usage: '2026-08-20' } } }))
    ).toBeNull();
  });

  it('says a different thing rather than nothing, now that subjects are counted apart', () => {
    // the old store could not tell "spoke about usage yesterday" from "spoke
    // yesterday", so this remark was lost
    const said = anticipate(
      seen({
        ...heavy,
        pickups: { today: 120, usual: 45, days: 9 },
        spokenBefore: { day: '2026-08-20', about: 'usage', said: { usage: '2026-08-20' } },
      })
    );
    expect(said?.about).toBe('pickups');
  });

  it('lets a subject speak again once its cooldown has passed', () => {
    expect(
      anticipate(seen({ ...heavy, spokenBefore: { day: '2026-08-17', about: 'usage', said: { usage: '2026-08-17' } } }))
        ?.about
    ).toBe('usage');
  });

  it('still says nothing at all when it has already spoken today', () => {
    expect(
      anticipate(
        seen({ ...heavy, spokenBefore: { day: '2026-08-21', about: 'place', said: { place: '2026-08-21' } } })
      )
    ).toBeNull();
  });
});

describe('the app that moved, rather than the day that did', () => {
  const instagram = seen({ topApp: { app: 'Instagram', today: 160, usual: 40, days: 6 } });

  it('names the app and both figures', () => {
    const said = anticipate(instagram);
    expect(said?.about).toBe('app');
    expect(said?.line).toContain('Instagram');
    expect(said?.line).toMatch(/2h 40m/);
    expect(said?.line).toContain('40m');
  });

  it('outranks the day total, which names nothing you could change', () => {
    const said = anticipate({ ...instagram, usage: { today: 400, usual: 100, days: 9 } });
    expect(said?.about).toBe('app');
  });

  it('spends `sir` once, like everything else that speaks', () => {
    expect(anticipate(instagram)!.line.match(/\bsir\b/gi)).toHaveLength(1);
  });
});

describe('being somewhere earlier than usual, and missing from somewhere', () => {
  // 8:10 rather than 7:55: the quiet hours start at 8, so an arrival remark
  // before then cannot be said at all — which is a real limit on this trigger and
  // not a detail of the fixture
  const early = seen({ now: at(8, 10), early: { place: 'Office', usualBy: 9 * 60 + 30, at: 8 * 60 + 10 } });
  const absent = seen({ now: at(10, 30), absent: { place: 'Office', usualBy: 9 * 60, days: 4 } });

  it('says you are early, with the hour you are usually there by', () => {
    const said = anticipate(early);
    expect(said?.about).toBe('arrival');
    expect(said?.line).toContain('Office');
    expect(said?.line).toMatch(/9:30/);
  });

  it('says you are not there, with the same figure behind it', () => {
    const said = anticipate(absent);
    expect(said?.about).toBe('absent');
    expect(said?.line).toContain('Office');
    expect(said?.line).toMatch(/9:00/);
  });

  it('ranks being missing above being early, one being actionable', () => {
    const said = anticipate({ ...absent, early: early.early });
    expect(said?.about).toBe('absent');
  });

  it('ranks still-being-somewhere-late above both, being about right now', () => {
    const said = anticipate({
      ...absent,
      place: 'Office',
      stillHereLate: true,
      goneBy: 18 * 60 + 40,
    });
    expect(said?.about).toBe('place');
  });
});

describe('a departure time that no longer matches what you do', () => {
  const drifted = seen({
    schedule: { place: 'Office', setAt: 9 * 60, goneBy: 8 * 60 + 30, days: 4 },
  });

  it('names both times and how many days are behind the measurement', () => {
    const said = anticipate(drifted);
    expect(said?.about).toBe('schedule');
    expect(said?.line).toMatch(/9:00/);
    expect(said?.line).toMatch(/8:30/);
    expect(said?.line).toContain('4');
  });

  it('says nothing about half an hour either way', () => {
    expect(
      anticipate(seen({ schedule: { place: 'Office', setAt: 9 * 60, goneBy: 8 * 60 + 50, days: 4 } }))
    ).toBeNull();
  });

  it('waits for enough measured days, like every other figure here', () => {
    expect(
      anticipate(seen({ schedule: { place: 'Office', setAt: 9 * 60, goneBy: 8 * 60, days: 2 } }))
    ).toBeNull();
  });

  it('says what it measured, which is last seen and not left', () => {
    // sightings need the app open, so it cannot claim to know when you walked out
    expect(anticipate(drifted)?.line).toMatch(/seen/i);
  });
});

/**
 * Today against your other Tuesdays.
 *
 * The redesign of 2026-09-01. The first cut asked whether you had reached a place
 * earlier than you usually reach it, which told somebody who had been home all night
 * that he was at Home early. The question that actually earns a remark is **what is
 * different about today** — you left before you usually do, or you are somewhere your
 * own weekdays say you are not.
 */
describe('leaving earlier than you usually do', () => {
  // 8:45, not 7:45: the quiet hours start at 8, so a remark about a 7:05 departure
  // can only be made once the phone is allowed to speak at all
  const left = seen({
    now: at(8, 45),
    left: { place: 'Home', lastSeen: 7 * 60 + 5, usualBy: 8 * 60 + 10, days: 4 },
  });

  it('names both times and the days behind them', () => {
    const said = anticipate(left);
    expect(said?.about).toBe('left');
    expect(said?.line).toContain('Home');
    expect(said?.line).toMatch(/7:05/);
    expect(said?.line).toMatch(/8:10/);
    expect(said?.line).toContain('4');
  });

  it('says seen rather than left, because that is what was measured', () => {
    // a sighting needs the app open, so the app knows when it last SAW you there
    expect(anticipate(left)?.line).toMatch(/seen/i);
  });

  it('outranks being somewhere unusual, which is the same fact with less in it', () => {
    const said = anticipate({ ...left, elsewhere: { usual: 'Home', days: 4 } });
    expect(said?.about).toBe('left');
  });

  it('spends `sir` once', () => {
    expect(anticipate(left)!.line.match(/\bsir\b/gi)).toHaveLength(1);
  });
});

describe('being somewhere your weekdays say you are not', () => {
  const away = seen({ now: at(8, 30), elsewhere: { usual: 'Home', days: 4 } });

  it('names where you usually are, rather than where you are not', () => {
    const said = anticipate(away);
    expect(said?.about).toBe('elsewhere');
    expect(said?.line).toContain('Home');
    expect(said?.line).toContain('4');
  });

  it('loses to still being somewhere late, which is about right now', () => {
    const said = anticipate({
      ...away,
      place: 'Office',
      stillHereLate: true,
      goneBy: 18 * 60 + 40,
    });
    expect(said?.about).toBe('place');
  });
});
