import { situationLine } from '../situation';

/**
 * The line the chat opens with, and why it exists.
 *
 * Chat opened on a stack of old turns and an empty field, which is what an app
 * looks like. It is not what a presence looks like: J.A.R.V.I.S. would say
 * something about *now* before being asked anything.
 *
 * Assembled entirely on the device, from values the app already holds — no model
 * call, no network, no latency. That constraint is the point. A greeting that
 * waits for a round trip is a loading state wearing a sentence.
 */

const at = (h: number, m = 0) => new Date(2026, 7, 20, h, m);

describe('the line the chat opens with', () => {
  it('always says something, because the clock is always known', () => {
    const said = situationLine({ now: at(11, 52), mode: null, connected: false, place: null, briefing: null });
    expect(said).toContain('11:52');
    expect(said.length).toBeGreaterThan(0);
  });

  it('spends `sir` exactly once', () => {
    const said = situationLine({
      now: at(7, 14),
      mode: 'desk',
      connected: true,
      place: 'Home',
      briefing: { hour: 18, minute: 30, label: 'Office' },
    });
    expect(said.match(/sir/gi)?.length).toBe(1);
  });

  /** Understatement is the whole instrument. */
  it('never exclaims', () => {
    const said = situationLine({
      now: at(7, 14),
      mode: 'desk',
      connected: true,
      place: 'Home',
      briefing: { hour: 18, minute: 30, label: 'Office' },
    });
    expect(said).not.toContain('!');
  });

  it('names where he thinks you are, when he knows', () => {
    const said = situationLine({ now: at(9), mode: 'cloud', connected: true, place: 'Office', briefing: null });
    expect(said).toContain('Office');
  });

  it('says nothing about place rather than guessing', () => {
    const said = situationLine({ now: at(9), mode: 'cloud', connected: true, place: null, briefing: null });
    expect(said.toLowerCase()).not.toContain('at ');
  });

  /**
   * The desk being up is the one piece of state worth volunteering: it decides
   * whether anything can actually be done, and nothing else on the screen says
   * so before a command has already failed.
   */
  it('says the desk is up when the link is the desk', () => {
    const said = situationLine({ now: at(9), mode: 'desk', connected: true, place: null, briefing: null });
    expect(said.toLowerCase()).toContain('desk');
  });

  it('does not claim the desk when only the cloud is answering', () => {
    const said = situationLine({ now: at(9), mode: 'cloud', connected: true, place: null, briefing: null });
    expect(said.toLowerCase()).not.toContain('desk');
  });

  /**
   * A dark link is the one thing here that must be said plainly rather than
   * dryly. Every state must name itself, and "no link" is the state most easily
   * mistaken for the app being broken.
   */
  it('admits a dark link before anything else', () => {
    const said = situationLine({ now: at(9), mode: null, connected: false, place: 'Home', briefing: null });
    expect(said.toLowerCase()).toContain('no link');
  });

  it('mentions a briefing that has not happened yet', () => {
    const said = situationLine({
      now: at(11),
      mode: 'cloud',
      connected: true,
      place: null,
      briefing: { hour: 18, minute: 30, label: 'Office' },
    });
    expect(said).toContain('6:30 PM');
  });

  /**
   * Announcing a briefing already sent is worse than saying nothing: it reads as
   * a promise, and the promise was kept an hour ago.
   */
  it('stops mentioning a briefing once its time has passed', () => {
    const said = situationLine({
      now: at(19, 30),
      mode: 'cloud',
      connected: true,
      place: null,
      briefing: { hour: 18, minute: 30, label: 'Office' },
    });
    expect(said).not.toContain('6:30');
  });

  /**
   * A status dump is not a greeting. Three clauses is the point at which this
   * stops reading as someone speaking and starts reading as a panel.
   */
  it('never runs past three clauses', () => {
    const said = situationLine({
      now: at(7, 14),
      mode: 'desk',
      connected: true,
      place: 'Home',
      briefing: { hour: 18, minute: 30, label: 'Office' },
    });
    expect(said.split(/[.,]/).filter((p) => p.trim()).length).toBeLessThanOrEqual(4);
  });

  it('reads the clock the way this app always prints one', () => {
    // meridiem on every clock — the rule the commute briefing exists to enforce
    const said = situationLine({
      now: at(0, 5),
      mode: 'cloud',
      connected: true,
      place: null,
      briefing: { hour: 8, minute: 0, label: 'Home' },
    });
    expect(said).toContain('12:05 AM');
    expect(said).toContain('8:00 AM');
  });
});
