import type { ChatEntry } from '../state/hudReducer';

/**
 * What one of your own turns says about itself, underneath it.
 *
 * Quiet by default, loud only when something is wrong — the way every other
 * assistant app behaves. No tick under a message whose answer is sitting directly
 * below it: a mark on every settled turn is noise you stop reading, and then the one
 * that matters is noise too.
 *
 * The reported bug this exists for (2026-08-21): *"I sent a message then closed the
 * app and didn't get a reply back."* Before this, a turn that was carried and never
 * answered looked exactly like one still being thought about.
 */
export type TurnMark = {
  label: string;
  /** `bad` reads as a fault; `waiting` is merely information */
  tone: 'bad' | 'waiting';
  /** whether sending it again is safe — see the note in the `failed` branch */
  retry: boolean;
};

/**
 * How long a carried turn may go unanswered before the wait is named.
 *
 * Long enough that a slow cloud turn is not accused of being lost — Render's free
 * tier can spend the better part of a minute waking up, and the first message of an
 * evening routinely does. Short enough to be useful when the answer genuinely never
 * arrives.
 */
export const STALE_WAIT_MS = 90_000;

export function turnMark(entry: ChatEntry, now: number, isLast: boolean): TurnMark | null {
  // Jarvis's turns are the answer, not a claim about delivery
  if (entry.from !== 'user') return null;

  switch (entry.state) {
    case 'sending':
      return { label: 'SENDING', tone: 'waiting', retry: false };

    case 'failed':
      /**
       * The one unambiguous retry in this app.
       *
       * Nothing carried the message, so it cannot have been acted on — re-sending
       * cannot run anything twice. Every other retry in this app would be a guess
       * about whether the far end already did the thing.
       */
      return { label: 'NOT SENT', tone: 'bad', retry: true };

    case 'awaiting':
      /**
       * Carried, and still owed an answer — and deliberately silent.
       *
       * This used to say `NO ANSWER` in red after ninety seconds. Reported as a bug
       * from the device on 2026-08-21, and the report was right: most turns that go
       * unanswered are remarks nobody owed a reply to, and a red fault marker on
       * "you are awesome" reads as the app being broken. Accusing the far end of
       * losing something is a claim, and this cannot tell a lost answer from one
       * that was never owed.
       *
       * The dropped-reply case it was covering is real and belongs to the mailbox —
       * `docs/superpowers/specs/2026-08-21-mailbox-delivery-design.md` — where the
       * gateway knows whether an answer exists and can say so without guessing.
       */
      return null;
    // `answered`, and anything restored from a log written before states existed
    default:
      return null;
  }
}
