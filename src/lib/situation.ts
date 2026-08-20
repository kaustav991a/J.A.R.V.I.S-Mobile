import { clockLabel } from './commute';

/**
 * One true sentence about now, assembled on the device.
 *
 * Chat used to open on a stack of old turns and an empty field, which is what an
 * app looks like. It is not what a presence looks like — the character this app
 * is named after says something about the situation before he is asked anything,
 * and the app already held every value needed to do that.
 *
 * **No network, no model, no await.** That constraint is the whole design. A
 * greeting that waits for a round trip is a loading state wearing a sentence, and
 * on this phone the first cloud call of an evening can take the better part of a
 * minute. Everything below comes from state already in memory.
 *
 * **It is not a status panel.** Home already has one of those, with meters. This
 * is someone speaking, so it is capped at three clauses and drops whatever it
 * does not know rather than printing "unknown".
 */

export type Situation = {
  now: Date;
  /** which half of the link is answering, or null when nothing is */
  mode: 'desk' | 'cloud' | null;
  connected: boolean;
  /** the named place he believes you are at, or null */
  place: string | null;
  /** the next commute briefing owed today, or null */
  briefing: { hour: number; minute: number; label: string } | null;
};

/**
 * `sir` is spent once and the clock spends it.
 *
 * It is punctuation, not deference — the same rule the commute briefing follows.
 * Repeated in every clause it stops reading as dry and starts reading as servile,
 * which is a different character entirely.
 */
export function situationLine(s: Situation): string {
  const clock = clockLabel(s.now.getHours(), s.now.getMinutes());

  /**
   * A dark link goes first and goes plainly.
   *
   * This is the one state here that must not be dry. Nothing else on the screen
   * says the link is down until a command has already failed, and "no link" is
   * the state most easily mistaken for the app being broken — which is the
   * failure shape this project keeps re-learning. So it leads, and it says so in
   * words rather than by omission.
   */
  if (!s.connected || s.mode === null) {
    const where = s.place ? ` You are at ${s.place}.` : '';
    return `${clock}, sir. No link — I am answering from memory alone.${where}`;
  }

  const clauses: string[] = [];

  // The desk being up is the piece worth volunteering: it decides whether
  // anything can actually be *done*, where the cloud can only talk. The cloud is
  // the ordinary case and goes unremarked — saying "on the cloud" every time
  // would be reporting the weather inside the app.
  if (s.mode === 'desk') clauses.push('the desk is awake');

  if (s.place) clauses.push(`you are at ${s.place}`);

  /**
   * A briefing still to come, and only still to come.
   *
   * Announcing one already sent reads as a promise, and the promise was kept an
   * hour ago. Compared in minutes rather than by hour so a 6:30 does not survive
   * until 7.
   */
  if (s.briefing) {
    const target = s.briefing.hour * 60 + s.briefing.minute;
    const nowMin = s.now.getHours() * 60 + s.now.getMinutes();
    if (nowMin < target) {
      clauses.push(
        `${s.briefing.label} briefing at ${clockLabel(s.briefing.hour, s.briefing.minute)}`
      );
    }
  }

  // Nothing to add is a real answer and gets a short sentence rather than a
  // padded one. "All quiet" would be the unfalsifiable filler this app has
  // already learned not to send.
  if (!clauses.length) return `${clock}, sir.`;

  // Three at most. Past that it stops being someone speaking and becomes a
  // panel, and Home is where panels live.
  const said = clauses.slice(0, 3);
  const last = said.pop();
  return said.length
    ? `${clock}, sir. ${said.join(', ')} and ${last}.`
    : `${clock}, sir. ${(last ?? '').charAt(0).toUpperCase()}${(last ?? '').slice(1)}.`;
}
