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
  departure: null,
  place: null,
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
          spokenBefore: { day: '2026-08-21', about: 'anything' },
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
          spokenBefore: { day: '2026-08-20', about: 'usage' },
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
