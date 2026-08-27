import { STALE_WAIT_MS, turnMark } from '../turnMark';
import type { ChatEntry } from '../../state/hudReducer';

/**
 * What a turn of yours says about itself underneath it.
 *
 * Quiet by default and loud only when something is wrong, which is how every other
 * assistant app behaves: no tick on a message that plainly got answered, and a clear
 * mark on one that did not.
 */
const mine = (state: ChatEntry['state'], at = 1_000_000): ChatEntry => ({
  from: 'user',
  text: 'lock the desk',
  at,
  ...(state ? { state } : {}),
});

const NOW = 1_000_000;

describe('a turn on its way', () => {
  it('says it is going', () => {
    expect(turnMark(mine('sending'), NOW, true)?.label).toBe('SENDING');
  });

  it('says nothing once it has been answered', () => {
    // the answer is directly below it. A tick under every settled message is noise
    // you stop reading, and then the one that matters is noise too
    expect(turnMark(mine('answered'), NOW, false)).toBeNull();
  });

  it('says nothing while a fresh answer could still be coming', () => {
    expect(turnMark(mine('awaiting'), NOW, true)).toBeNull();
  });
});

describe('a turn nothing could carry', () => {
  const failed = turnMark(mine('failed'), NOW, true);

  it('says it never left', () => {
    expect(failed?.label).toBe('NOT SENT');
  });

  it('offers to send it again, which is safe precisely because nothing carried it', () => {
    // the one unambiguous retry in the app: it cannot have run twice on the desk if
    // it never arrived once
    expect(failed?.retry).toBe(true);
  });

  it('is treated as wrong rather than merely pending', () => {
    expect(failed?.tone).toBe('bad');
  });
});

/**
 * The app died with the send half-made.
 *
 * Found on the device 2026-08-27: a `thanks Jarvis` from three days earlier still
 * reading `SENDING`, because the process that owned the send was killed between
 * `local_command` and its result, and nothing re-examined the turn on reload. The
 * operator read it as never sent and re-sent it by hand, which is the only duplicate
 * in that log.
 */
describe('a turn the app was killed in the middle of', () => {
  const cut = turnMark(mine('interrupted'), NOW, true);

  it('says what happened rather than guessing the outcome', () => {
    expect(cut?.label).toBe('INTERRUPTED');
  });

  it('does NOT offer to send it again', () => {
    // `failed` may offer that because nothing carried the message. This state cannot
    // make the same promise: the app can die after `link.send()` as well as before it,
    // and a "run script" sent twice runs twice.
    expect(cut?.retry).toBe(false);
  });

  it('reads as wrong, because it needs a decision and will not resolve itself', () => {
    expect(cut?.tone).toBe('bad');
  });
});

describe('a turn that was carried and never answered', () => {
  /**
   * Silent, and that is a decision rather than an omission.
   *
   * It said `NO ANSWER` in red for one afternoon. Reported as a bug and the report
   * was right: most unanswered turns are remarks nobody owed a reply to, and a red
   * marker on "you are awesome" reads as breakage. Nothing here can tell a lost
   * answer from one that was never owed, and the mailbox spec is where that
   * distinction actually lives.
   */
  it('says nothing, however long the wait has been', () => {
    expect(turnMark(mine('awaiting'), NOW + STALE_WAIT_MS * 10, true)).toBeNull();
  });

  it('says nothing when it is not even the newest turn', () => {
    expect(turnMark(mine('awaiting'), NOW + STALE_WAIT_MS * 10, false)).toBeNull();
  });
});
describe("Jarvis's own turns", () => {
  it('carry no mark at all', () => {
    expect(turnMark({ from: 'jarvis', text: 'Twenty four minutes, sir.', at: NOW }, NOW, true)).toBeNull();
  });
});

describe('a log written before any of this existed', () => {
  it('is left alone rather than described', () => {
    // a fortnight of restored turns have no state, and drawing them all as SENDING
    // would be a lie about every one of them
    expect(turnMark(mine(undefined), NOW, true)).toBeNull();
  });
});
