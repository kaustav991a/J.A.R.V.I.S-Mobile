import { clockLabel } from './commute';
import { ENOUGH_PLACE_DAYS } from './timeline';

/**
 * What he is watching, and what he is still waiting for.
 *
 * **Why this panel exists.** Anticipation says nothing most days by design, and
 * nothing at all for its first four days by necessity — the place signal needs that
 * many days of sightings before "usually" means anything. Without somewhere to read
 * that, a working feature and a broken one look identical, which is the failure this
 * codebase has paid for more than any other: the briefing was read as broken for four
 * days while it was correctly silent.
 *
 * So this is the same rule applied to a feature rather than to a seam — every state
 * must name itself. It is a readout, not a promise: it says what he has and what he is
 * short of, and never when he will next speak, because that depends on the day being
 * unusual and nothing here can know that in advance.
 */
export type WatchRow = {
  id: string;
  label: string;
  /** the state in words. A bare dot cannot be read, here or on the status panel */
  word: string;
  /** whether this signal can contribute a remark today */
  ready: boolean;
  /** one line, when the state does not explain itself */
  note?: string;
};

export type WatchFacts = {
  /** days of journal history behind the screen-time comparison */
  baselineDays: number;
  /** distinct earlier days he has been seen at the place he is at now */
  placeDays: number;
  /** the named place he is at, or null */
  place: string | null;
  /**
   * The minute of the day he is usually last seen at that place, or null.
   *
   * Carried so the row can SAY it. Before this the figure existed, was correct, and
   * was surfaced in exactly one place — the anticipation remark, which fires only when
   * he is 45 minutes past it. So on every ordinary day the app had learned an hour and
   * told nobody, which fails the anticipation doctrine's own third test: a figure you
   * could disagree with, rather than an adjective.
   *
   * Null is a real answer and must stay one. `usuallyGoneBy` returns null below
   * `ENOUGH_PLACE_DAYS`, and the row must not invent a time to fill the space.
   */
  goneBy: number | null;
  /** whether the one remark a day has already been spent */
  spokenToday: boolean;
};

/** the journal's own threshold for calling a day unusual — mirrors `anticipate` */
const ENOUGH_BASELINE_DAYS = 3;

/** `3 more days`, and the singular, because "1 more days" reads as a bug */
const owed = (have: number, need: number): string => {
  const left = Math.max(0, need - have);
  return `${left} more day${left === 1 ? '' : 's'}`;
};

export function watching(f: WatchFacts): WatchRow[] {
  return [
    {
      id: 'today',
      label: 'Today',
      /**
       * The budget, not a countdown to the next remark.
       *
       * "He will speak at 7" would be a promise, and whether he speaks depends on the
       * day being unusual — which is not knowable in advance. What IS knowable is
       * whether the one remark a day has been spent.
       */
      ...(f.spokenToday
        ? { ready: false, word: 'SPOKEN', note: 'One remark a day. Nothing more until tomorrow.' }
        : { ready: true, word: 'LISTENING' }),
    },
    {
      id: 'usage',
      label: 'Screen time against your usual',
      ...(f.baselineDays >= ENOUGH_BASELINE_DAYS
        ? { ready: true, word: `${f.baselineDays} days` }
        : {
            ready: false,
            word: owed(f.baselineDays, ENOUGH_BASELINE_DAYS),
            note: 'Unusual against two days of history is not a finding.',
          }),
    },
    {
      id: 'place',
      /**
       * It says LAST SEEN, because that is what it is.
       *
       * It read "When you are usually gone — 3:40 PM" to somebody who leaves at seven,
       * and the figure was never a departure: a sighting needs the app open, so it is
       * the hour he stops checking his phone at work. Reported 2026-09-01. The label
       * now claims only what the sightings can carry.
       */
      label: 'When you were last seen there',
      // the place he is at now, because that is the one he could be remarked on for.
      // Naming it matters: "4 more days" with no subject reads as a countdown to
      // nothing at all
      ...(f.placeDays >= ENOUGH_PLACE_DAYS
        ? f.goneBy !== null
          ? {
              ready: true,
              // the figure itself, because that is the whole point of having learned it
              word: clockLabel(Math.floor(f.goneBy / 60), f.goneBy % 60),
              note: f.place
                ? `The app has to be open to see you, so this is a floor, not your leaving time. From ${f.placeDays} days at ${f.place}.`
                : `The app has to be open to see you, so this is a floor, not your leaving time. From ${f.placeDays} days.`,
            }
          : // enough days, and still no median — every sighting landed on one of them.
            // `ready` because the signal is armed; no time, because there is not one
            { ready: true, word: f.place ? `${f.place}, ready` : 'ready' }
        : {
            ready: false,
            word: owed(f.placeDays, ENOUGH_PLACE_DAYS),
            note: f.place
              ? `Learning your hours at ${f.place}. Sightings happen when you open the app.`
              : 'Waiting to see you somewhere you have named.',
          }),
    },
  ];
}

/** how many signals could speak today, for the caption */
export const readyCount = (rows: WatchRow[]): number => rows.filter((r) => r.ready).length;
