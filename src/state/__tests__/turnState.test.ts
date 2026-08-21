import { hudReducer, initialHudState } from '../hudReducer';
import type { HudAction, HudState } from '../hudReducer';

/**
 * What happened to the message you sent.
 *
 * Every other assistant app answers this and this one never has: a turn was echoed
 * into the log and then nothing on screen distinguished "being carried", "carried and
 * being thought about", "carried and the answer was lost", and "never left the phone".
 * All four looked identical — your words, and a typing indicator that may or may not
 * mean anything. Reported on 2026-08-21 as "I sent a message then closed the app and
 * never got a reply back".
 *
 * The state lives on the user's own turn rather than in a side table, because it is a
 * fact about that turn and the log is what survives a restart.
 */
const run = (actions: HudAction[], from: HudState = initialHudState): HudState =>
  actions.reduce(hudReducer, from);

const said = (text: string, at: number): HudAction => ({ type: 'local_command', text, at });

const answered = (message: string, at: number): HudAction => ({
  type: 'frame',
  frame: { kind: 'status', status: 'speaking', message, user: null },
  at,
});

describe('a turn on its way out', () => {
  it('starts as sending, because nothing is known yet', () => {
    const s = run([said('lock the desk', 100)]);
    expect(s.chat[0].state).toBe('sending');
  });

  it('becomes awaiting once something has carried it', () => {
    // carried is not answered: the interesting wait starts here, and this is the
    // state a dropped reply leaves behind
    const s = run([said('lock the desk', 100), { type: 'turn_sent', at: 100 }]);
    expect(s.chat[0].state).toBe('awaiting');
  });

  it('becomes failed when nothing could carry it', () => {
    const s = run([said('lock the desk', 100), { type: 'turn_failed', at: 100 }]);
    expect(s.chat[0].state).toBe('failed');
  });

  it('marks only the turn it is about', () => {
    const s = run([said('first', 100), said('second', 200), { type: 'turn_failed', at: 200 }]);
    expect(s.chat[0].state).toBe('sending');
    expect(s.chat[1].state).toBe('failed');
  });

  it('ignores a mark for a turn that is no longer in the log', () => {
    // the log is capped, so a very old turn's result can arrive after it has gone
    const s = run([said('first', 100), { type: 'turn_sent', at: 999 }]);
    expect(s.chat).toHaveLength(1);
    expect(s.chat[0].state).toBe('sending');
  });
});

describe('a turn that gets its answer', () => {
  it('is answered as soon as Jarvis speaks after it', () => {
    const s = run([said('how far is the office', 100), { type: 'turn_sent', at: 100 }, answered('Twenty four minutes, sir.', 200)]);
    expect(s.chat[0].state).toBe('answered');
    expect(s.chat[1].from).toBe('jarvis');
  });

  it('answers only the turn that was actually waiting', () => {
    // two questions in a row and one reply: the older one is the one answered, and
    // the newer is still owed something
    const s = run([
      said('first', 100),
      { type: 'turn_sent', at: 100 },
      said('second', 200),
      { type: 'turn_sent', at: 200 },
      answered('An answer.', 300),
    ]);
    expect(s.chat[0].state).toBe('answered');
    expect(s.chat[1].state).toBe('awaiting');
  });

  it('leaves a failed turn failed, because no answer arrived for it', () => {
    const s = run([said('first', 100), { type: 'turn_failed', at: 100 }, answered('Unrelated.', 300)]);
    expect(s.chat[0].state).toBe('failed');
  });
});

describe('what a restored log says', () => {
  it('treats a turn stored without a state as settled rather than pending', () => {
    // logs written before this existed have no state at all, and showing a
    // fortnight of old messages as "sending" would be a lie about every one of them
    const s = hudReducer(initialHudState, {
      type: 'hydrate',
      chat: [
        { from: 'user', text: 'old question', at: 1 },
        { from: 'jarvis', text: 'old answer', at: 2 },
      ],
    });
    expect(s.chat[0].state).toBeUndefined();
  });
});

/**
 * Sending again replaces the attempt that failed.
 *
 * Reported from the device 2026-08-21: pressing SEND AGAIN left the failed turn on
 * screen and put the new one underneath it, so the chat showed the same sentence
 * twice — once in red and once for real. A retry is the same message having another
 * go, not a second message.
 */
describe('sending a failed turn again', () => {
  it('takes the failed attempt out of the log', () => {
    const s = run([said('lock the desk', 100), { type: 'turn_failed', at: 100 }, { type: 'turn_drop', at: 100 }]);
    expect(s.chat).toHaveLength(0);
  });

  it('leaves a turn that was actually carried alone', () => {
    // only a failed attempt may be withdrawn: anything that reached the far end is
    // part of the record, whatever became of the answer
    const s = run([said('lock the desk', 100), { type: 'turn_sent', at: 100 }, { type: 'turn_drop', at: 100 }]);
    expect(s.chat).toHaveLength(1);
  });

  it('leaves the rest of the conversation alone', () => {
    const s = run([
      said('first', 100),
      { type: 'turn_sent', at: 100 },
      said('second', 200),
      { type: 'turn_failed', at: 200 },
      { type: 'turn_drop', at: 200 },
    ]);
    expect(s.chat.map((c) => c.text)).toEqual(['first']);
  });
});

/**
 * Removing one of your own messages.
 *
 * Asked for 2026-08-21: a long press on your own turn should offer to copy it or take
 * it out. **Yours only** — his turns are the record of what was said to you, and a
 * chat where either side can be edited is not a record of anything.
 */
describe('taking one of your own turns out', () => {
  it('removes it whatever state it was in', () => {
    // unlike `turn_drop`, this is not about a retry: it is the user deciding the
    // message should not be there, and that applies to a delivered one too
    const s = run([said('lock the desk', 100), { type: 'turn_sent', at: 100 }, { type: 'turn_remove', at: 100 }]);
    expect(s.chat).toHaveLength(0);
  });

  it('refuses to remove one of his', () => {
    const s = run([answered('Twenty four minutes, sir.', 100), { type: 'turn_remove', at: 100 }]);
    expect(s.chat).toHaveLength(1);
  });

  it('leaves the rest of the conversation alone', () => {
    const s = run([said('first', 100), said('second', 200), { type: 'turn_remove', at: 200 }]);
    expect(s.chat.map((c) => c.text)).toEqual(['first']);
  });
});
