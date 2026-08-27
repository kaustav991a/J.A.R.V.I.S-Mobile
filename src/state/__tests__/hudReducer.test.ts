import { hudReducer, initialHudState, HudState } from '../hudReducer';
import { JarvisFrame } from '../../ws/frames';

const feed = (frames: JarvisFrame[], start: HudState = initialHudState): HudState =>
  frames.reduce((s, frame, i) => hudReducer(s, { type: 'frame', frame, at: 1000 + i }), start);

describe('hudReducer', () => {
  it('starts dark and empty', () => {
    expect(initialHudState.status).toBe('boot');
    expect(initialHudState.parked).toEqual([]);
    expect(initialHudState.lastFrameAt).toBeNull();
  });

  it('applies a status frame and logs the message to chat', () => {
    const s = feed([{ kind: 'status', status: 'speaking', message: 'Systems nominal', user: 'sir' }]);
    expect(s.status).toBe('speaking');
    expect(s.message).toBe('Systems nominal');
    expect(s.user).toBe('sir');
    expect(s.chat).toEqual([{ from: 'jarvis', text: 'Systems nominal', at: 1000 }]);
    expect(s.lastFrameAt).toBe(1000);
  });

  it('keeps link notices out of the conversation', () => {
    // `online` and `offline` are the link describing itself, not J.A.R.V.I.S.
    // saying something. The gateway greets every connection with "Cloud brain
    // only, so PC control is off…", and the phone re-dials often enough that the
    // chat filled with a sentence nobody asked for. The state still tracks it;
    // the Connection screen and Home's status card are where it belongs.
    const s = feed([
      { kind: 'status', status: 'online', message: 'Cloud brain only, so PC control is off.', user: 'sir' },
      { kind: 'status', status: 'offline', message: 'SYSTEM OFFLINE // STANDBY', user: 'sir' },
    ]);
    expect(s.chat).toEqual([]);
    expect(s.status).toBe('offline');
    expect(s.message).toBe('SYSTEM OFFLINE // STANDBY');
  });

  it('does not log an empty status message to chat', () => {
    const s = feed([{ kind: 'status', status: 'listening', message: '', user: null }]);
    expect(s.chat).toEqual([]);
    expect(s.status).toBe('listening');
  });

  it('merges telemetry rather than replacing it', () => {
    const s = feed([
      { kind: 'telemetry', data: { cpu: 34, mem: 61 } },
      { kind: 'telemetry', data: { cpu: 40 } },
    ]);
    expect(s.telemetry).toEqual({ cpu: 40, mem: 61 });
  });

  it('replaces weather wholesale', () => {
    const s = feed([
      { kind: 'weather', data: { temp: 31, desc: 'haze' } },
      { kind: 'weather', data: { temp: 29 } },
    ]);
    expect(s.weather).toEqual({ temp: 29 });
  });

  it('appends agent steps to the trace, newest last, capped at 50', () => {
    const many: JarvisFrame[] = Array.from({ length: 60 }, (_, i) => ({
      kind: 'agent_step',
      goal: 'tidy',
      event: `step-${i}`,
      detail: '',
      step: i,
    }));
    const s = feed(many);
    expect(s.trace).toHaveLength(50);
    expect(s.trace[0].event).toBe('step-10');
    expect(s.trace[49].event).toBe('step-59');
  });

  it('queues a parked action', () => {
    const s = feed([
      { kind: 'agent_parked', id: 'a1', goal: 'tidy', action: 'delete 3 files', detail: 'x,y,z', risk: 'high' },
    ]);
    expect(s.parked).toEqual([
      { id: 'a1', goal: 'tidy', action: 'delete 3 files', detail: 'x,y,z', risk: 'high', at: 1000, resolving: false },
    ]);
  });

  it('upserts a re-sent parked action instead of duplicating it', () => {
    const s = feed([
      { kind: 'agent_parked', id: 'a1', goal: 'tidy', action: 'delete 3 files', detail: '', risk: 'high' },
      { kind: 'agent_parked', id: 'a1', goal: 'tidy', action: 'delete 4 files', detail: '', risk: 'high' },
    ]);
    expect(s.parked).toHaveLength(1);
    expect(s.parked[0].action).toBe('delete 4 files');
  });

  it('removes a parked action when a resolved confirm arrives', () => {
    const s = feed([
      { kind: 'agent_parked', id: 'a1', goal: 'tidy', action: 'delete 3 files', detail: '', risk: 'high' },
      { kind: 'agent_confirm', id: 'a1', action: '', resolved: true, approved: true },
    ]);
    expect(s.parked).toEqual([]);
  });

  it('treats an unresolved confirm as a pending approval request', () => {
    const s = feed([{ kind: 'agent_confirm', id: 'b9', action: 'reboot pc', resolved: false, approved: false }]);
    expect(s.parked).toEqual([
      { id: 'b9', goal: '', action: 'reboot pc', detail: '', risk: '', at: 1000, resolving: false },
    ]);
  });

  it('ignores a confirm for an id it never parked', () => {
    const s = feed([
      { kind: 'agent_parked', id: 'a1', goal: '', action: 'x', detail: '', risk: '' },
      { kind: 'agent_confirm', id: 'zz', action: '', resolved: true, approved: true },
    ]);
    expect(s.parked.map((p) => p.id)).toEqual(['a1']);
  });

  it('marks a parked action as resolving optimistically', () => {
    const parked = feed([{ kind: 'agent_parked', id: 'a1', goal: '', action: 'x', detail: '', risk: '' }]);
    const s = hudReducer(parked, { type: 'resolving', id: 'a1' });
    expect(s.parked[0].resolving).toBe(true);
  });

  it('drops a locally resolved action when the server never echoes', () => {
    const parked = feed([{ kind: 'agent_parked', id: 'a1', goal: '', action: 'x', detail: '', risk: '' }]);
    const s = hudReducer(parked, { type: 'resolved_local', id: 'a1' });
    expect(s.parked).toEqual([]);
  });

  it('logs a locally sent command to chat, capped at 100', () => {
    let s = initialHudState;
    for (let i = 0; i < 120; i++) {
      s = hudReducer(s, { type: 'local_command', text: `cmd-${i}`, at: 2000 + i });
    }
    expect(s.chat).toHaveLength(100);
    // `sending` since 2026-08-21: a turn arrives knowing nothing about its own
    // delivery, and saying so is what makes a dropped answer visible later
    expect(s.chat[0]).toEqual({ from: 'user', text: 'cmd-20', at: 2020, state: 'sending' });
    expect(s.chat[99].text).toBe('cmd-119');
  });

  it('resets to the initial state', () => {
    const s = feed([{ kind: 'status', status: 'online', message: 'hi', user: 'sir' }]);
    expect(hudReducer(s, { type: 'reset' })).toEqual(initialHudState);
  });

  it('never mutates the state it was given', () => {
    const before = feed([{ kind: 'agent_step', goal: 'g', event: 'e', detail: '', step: 1 }]);
    const snapshot = JSON.stringify(before);
    hudReducer(before, { type: 'frame', frame: { kind: 'agent_step', goal: 'g', event: 'e2', detail: '', step: 2 }, at: 5000 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  describe('the desk watch', () => {
    const seen: JarvisFrame = {
      kind: 'intruder',
      id: 'i-1',
      expiresIn: 30,
      image: '/api/intruder/i-1.jpg',
      user: 'KAUSTAV',
      trigger: 'unlock',
    };

    it('turns the desk-sent duration into one deadline on this phone', () => {
      // the desk sends seconds-remaining, never a timestamp: this sum is the
      // only place the two machines' clocks ever meet
      const s = feed([seen]);
      expect(s.intruder).toMatchObject({ id: 'i-1', deadline: 1000 + 30_000, resolving: false });
    });

    it('logs the sighting to the timeline as well as raising the alert', () => {
      const s = feed([seen]);
      expect(s.trace.at(-1)).toMatchObject({ goal: 'Desk watch', event: 'seen' });
    });

    it('holds only the newest alert', () => {
      const s = feed([seen, { ...seen, id: 'i-2' }]);
      expect(s.intruder?.id).toBe('i-2');
    });

    it('clears the alert when the desk says it is resolved', () => {
      const s = feed([seen, { kind: 'intruder_resolved', id: 'i-1', outcome: 'approved' }]);
      expect(s.intruder).toBeNull();
      expect(s.trace.at(-1)).toMatchObject({ event: 'approved', detail: 'Confirmed as you' });
    });

    it('says what happened to the machine, in Chat', () => {
      // "approved" does not tell you whether the desk ended up open or shut, and
      // afterwards that is the only thing worth knowing
      const open = feed([seen, { kind: 'intruder_resolved', id: 'i-1', outcome: 'approved' }]);
      expect(open.chat.at(-1)).toMatchObject({ from: 'jarvis', text: 'That was you — the desk is still unlocked.' });

      const shut = feed([seen, { kind: 'intruder_resolved', id: 'i-1', outcome: 'locked' }]);
      expect(shut.chat.at(-1)?.text).toContain('Desk locked');
    });

    it('says so in Chat when the window simply ran out', () => {
      const s = hudReducer(feed([seen]), { type: 'intruder_expired', id: 'i-1', at: 40_000 });
      expect(s.chat.at(-1)).toMatchObject({ from: 'jarvis', at: 40_000 });
      expect(s.chat.at(-1)?.text).toContain('locked the desk');
    });

    it('records a lock as a lock, not as an approval', () => {
      const s = feed([seen, { kind: 'intruder_resolved', id: 'i-1', outcome: 'locked' }]);
      expect(s.trace.at(-1)).toMatchObject({ event: 'locked', detail: 'Desk locked' });
    });

    it('does not let a resolution for another alert clear the live one', () => {
      const s = feed([seen, { kind: 'intruder_resolved', id: 'other', outcome: 'approved' }]);
      expect(s.intruder?.id).toBe('i-1');
    });

    it('marks the alert as resolving while the desk is being told', () => {
      const s = hudReducer(feed([seen]), { type: 'intruder_resolving', id: 'i-1' });
      expect(s.intruder?.resolving).toBe(true);
    });

    it('ignores a resolving action naming an alert that is not live', () => {
      const s = hudReducer(feed([seen]), { type: 'intruder_resolving', id: 'stale' });
      expect(s.intruder?.resolving).toBe(false);
    });

    it('stops offering an answer once the window has run out', () => {
      const s = hudReducer(feed([seen]), { type: 'intruder_expired', id: 'i-1', at: 40_000 });
      expect(s.intruder).toBeNull();
      expect(s.trace.at(-1)).toMatchObject({ event: 'locked', detail: 'No answer in time — desk locked' });
    });

    it('ignores an expiry for an alert that has already been replaced', () => {
      const live = feed([seen, { ...seen, id: 'i-2' }]);
      const s = hudReducer(live, { type: 'intruder_expired', id: 'i-1', at: 40_000 });
      expect(s).toBe(live);
    });
  });
});

describe('a status that repeats', () => {
  it('is not logged twice in a row', () => {
    // the gateway greets every connect with the same sentence, and the phone
    // re-dials on foreground, network change and watchdog — so the log filled up
    // with one line repeated and nothing said in between
    const said = { kind: 'status' as const, status: 'speaking', message: 'Working on it.', user: 'KAUSTAV' };
    let s = hudReducer(initialHudState, { type: 'frame', frame: said, at: 1 });
    s = hudReducer(s, { type: 'frame', frame: said, at: 2 });
    s = hudReducer(s, { type: 'frame', frame: said, at: 3 });
    expect(s.chat).toEqual([{ from: 'jarvis', text: 'Working on it.', at: 1 }]);
    // the live status still tracks every frame; it is only the log that dedupes
    expect(s.message).toBe('Working on it.');
  });

  it('is logged again once something else has been said', () => {
    // the same answer after other turns is information, not an echo
    //
    // **The spacing was 1, 2, 3 ms and was widened on 2026-08-24, deliberately.** The
    // assertion is unchanged; only the clock is. A duplicate delivered twice — once
    // pushed, once over the socket — lands 422–459 ms apart on the real device, so at
    // millisecond spacing "a genuine re-answer" and "the same event twice" are the same
    // input and no rule can honour both. The measured gap between real repeats in that
    // same log is 32.9 s at the closest. This test asks for the behaviour that actually
    // happens, at the distance it actually happens at.
    const said = { kind: 'status' as const, status: 'speaking', message: 'Working on it.', user: null };
    let s = hudReducer(initialHudState, { type: 'frame', frame: said, at: 1 });
    s = hudReducer(s, { type: 'local_command', text: 'what time is it', at: 2 });
    s = hudReducer(s, { type: 'frame', frame: said, at: 40_000 });
    expect(s.chat.map((c) => c.at)).toEqual([1, 2, 40_000]);
  });
});

describe('the desk attaching to the gateway', () => {
  it('starts unknown rather than off, because nobody has said', () => {
    // `false` is a claim that the desk is down. On a LAN session, or before the
    // gateway has spoken, the app has been told nothing and must say nothing
    expect(initialHudState.deskLinked).toBeNull();
  });

  it('records the change without narrating it into the chat', () => {
    const s = hudReducer(initialHudState, {
      type: 'frame',
      frame: { kind: 'desk_link', linked: true },
      at: 4,
    });
    expect(s.deskLinked).toBe(true);
    expect(s.chat).toEqual([]);

    const off = hudReducer(s, { type: 'frame', frame: { kind: 'desk_link', linked: false }, at: 5 });
    expect(off.deskLinked).toBe(false);
    expect(off.chat).toEqual([]);
  });
});

describe('a voice transcript', () => {
  it('is logged as him speaking, not as J.A.R.V.I.S.', () => {
    // a typed command gets its user entry from `local_command`; a spoken one has
    // no local text, so this frame is the only place it can come from
    const s = hudReducer(initialHudState, {
      type: 'frame',
      frame: { kind: 'transcript', text: 'lock the pc' },
      at: 7,
    });
    expect(s.chat).toEqual([{ from: 'user', text: 'lock the pc', at: 7 }]);
  });
});

describe('the bugs an audit found in the reducer', () => {
  /**
   * Park-then-ask is the ordinary agent flow, and it used to blank the card.
   *
   * `agent_confirm` carries only an action — the goal, the detail and the risk are
   * not on that frame — and `upsertParked` spread the whole object over the
   * existing entry. So a parked action that arrived with a full description had it
   * overwritten with three empty strings at the exact moment the user was asked to
   * approve it. You were shown a decision with nothing to decide on.
   */
  it('keeps the parked description when a confirm arrives for the same action', () => {
    const s = feed([
      {
        kind: 'agent_parked',
        id: 'a1',
        goal: 'clear the download folder',
        action: 'delete 41 files',
        detail: 'nothing modified in the last 30 days',
        risk: 'high',
      },
      { kind: 'agent_confirm', id: 'a1', action: 'delete 41 files', resolved: false, approved: false },
    ]);
    expect(s.parked).toHaveLength(1);
    expect(s.parked[0].goal).toBe('clear the download folder');
    expect(s.parked[0].detail).toBe('nothing modified in the last 30 days');
    expect(s.parked[0].risk).toBe('high');
  });

  /**
   * The live alert is guarded; the announcement was not.
   *
   * A resolution for an older id left the countdown on screen — correctly — and
   * still wrote "Desk locked" into the chat and the timeline. The log then
   * contradicted the screen, on the one subject where that matters.
   */
  it('says nothing when a resolution arrives for an alert that is not the live one', () => {
    const s = feed([
      { kind: 'intruder', id: 'now', expiresIn: 30, image: null, user: 'kaustav', trigger: 'wake' },
      { kind: 'intruder_resolved', id: 'earlier', outcome: 'locked' },
    ]);
    expect(s.intruder?.id).toBe('now');
    expect(s.chat).toEqual([]);
    expect(s.trace.filter((t) => t.event === 'locked')).toEqual([]);
  });

  it('still announces the resolution of the alert that is live', () => {
    const s = feed([
      { kind: 'intruder', id: 'now', expiresIn: 30, image: null, user: 'kaustav', trigger: 'wake' },
      { kind: 'intruder_resolved', id: 'now', outcome: 'approved' },
    ]);
    expect(s.intruder).toBeNull();
    expect(s.chat).toHaveLength(1);
  });

  /**
   * Two turns can share a millisecond, and one of them used to disappear.
   *
   * `hydrate` de-duplicated restored turns against what was already in state on
   * `(from, at)` alone, so a restored line was dropped whenever an unrelated line
   * from the same side happened to carry the same timestamp.
   */
  it('restores two different turns that share a timestamp', () => {
    const live: HudState = {
      ...initialHudState,
      chat: [{ from: 'jarvis', text: 'the second thing', at: 500 }],
    };
    const s = hudReducer(live, {
      type: 'hydrate',
      chat: [{ from: 'jarvis', text: 'the first thing', at: 500 }],
    });
    expect(s.chat.map((c) => c.text)).toEqual(['the first thing', 'the second thing']);
  });

  it('still drops a restored turn that is the same turn', () => {
    const live: HudState = {
      ...initialHudState,
      chat: [{ from: 'jarvis', text: 'greetings', at: 500 }],
    };
    const s = hudReducer(live, {
      type: 'hydrate',
      chat: [{ from: 'jarvis', text: 'greetings', at: 500 }],
    });
    expect(s.chat).toHaveLength(1);
  });
});

/**
 * A reply that was pushed AND carried over the socket is one thing that happened.
 *
 * Read off the phone on 2026-08-24, and the order is the tell — it cannot come from
 * appending in arrival order:
 *
 * ```
 * Standing by, Sir.                    Jarvis · 12:19
 * do you tell me .. what's on screen   You    · 12:20
 * I can't see your screen from here    Jarvis · 12:21
 * Standing by, Sir.                    Jarvis · 12:19   <- again, and below 12:21
 * ```
 *
 * The second copy carries the FIRST one's timestamp, so it was appended last while
 * describing something that happened earlier. That is the tray sweep: `pendingReplies()`
 * returns a notification still sitting in the shade, and the provider dispatches it with
 * `at: reply.at` — its original arrival time — so a reply already logged over the socket
 * comes back as a second entry stamped in the past.
 *
 * The consecutive-duplicate guard cannot catch it, and that is not a flaw in the guard:
 * by the time the sweep runs, other turns have landed, so the copy is not adjacent to its
 * original. Widening the guard to "same text anywhere" would break the behaviour it was
 * written for — the same answer arriving after something else was said IS information.
 *
 * The distinction that holds is identity, not adjacency: same sender, same text, same
 * millisecond is the same event. A genuine second occurrence carries a different `at` and
 * must still append. `hydrate` already draws the line exactly there and the key below is
 * the same one, deliberately.
 */
/**
 * A turn that describes an earlier moment belongs at that moment.
 *
 * Reported from the device: yesterday's 15:xx entries rendered BELOW today's 12:xx
 * ones. Deduplication was never the whole of `chat-order` — a swept entry that is
 * not a duplicate of anything still carries the notification's own time and was
 * still appended last, so the log read in the order things were RECEIVED rather
 * than the order they happened.
 *
 * Two readers assumed insertion order was chronological and both were wrong:
 * `ChatScreen` reverses the array without sorting, and Home takes
 * `chat[chat.length - 1]` as the last thing said. Fixed where the entry is made
 * rather than at either reader, because `activity.ts` sorts the same data and the
 * two views disagreeing is the bug one layer up.
 */
describe('a turn stamped earlier than the one before it', () => {
  const said = (message: string) =>
    ({ kind: 'status', status: 'speaking', message, user: null }) as const;

  it('sits at its own time rather than at the end of the log', () => {
    let s = hudReducer(initialHudState, { type: 'frame', frame: said('This morning, sir.'), at: 5_000 });
    // swept out of the tray now, but it was said last night
    s = hudReducer(s, { type: 'frame', frame: said('Last night, sir.'), at: 1_000 });

    expect(s.chat.map((c) => c.text)).toEqual(['Last night, sir.', 'This morning, sir.']);
    expect(s.chat.map((c) => c.at)).toEqual([1_000, 5_000]);
  });

  it('leaves Home reading the latest turn rather than the last one to arrive', () => {
    let s = hudReducer(initialHudState, { type: 'frame', frame: said('This morning, sir.'), at: 5_000 });
    s = hudReducer(s, { type: 'frame', frame: said('Last night, sir.'), at: 1_000 });

    // HomeScreen takes the final entry as "last said"
    expect(s.chat[s.chat.length - 1].text).toBe('This morning, sir.');
  });

  it('keeps arrival order for turns sharing a millisecond, so a reply follows its question', () => {
    let s = hudReducer(initialHudState, { type: 'local_command', text: 'you there?', at: 2_000 });
    s = hudReducer(s, { type: 'frame', frame: said('Always, sir.'), at: 2_000 });

    expect(s.chat.map((c) => c.text)).toEqual(['you there?', 'Always, sir.']);
  });

  it('does not disturb a log that already arrived in order', () => {
    let s = hudReducer(initialHudState, { type: 'local_command', text: 'first', at: 1_000 });
    s = hudReducer(s, { type: 'frame', frame: said('second'), at: 2_000 });
    s = hudReducer(s, { type: 'local_command', text: 'third', at: 3_000 });

    expect(s.chat.map((c) => c.text)).toEqual(['first', 'second', 'third']);
  });
});

describe('a pushed reply that was also carried over the socket', () => {
  const greeting = { kind: 'status', status: 'speaking', message: 'Standing by, Sir.', user: null } as const;

  it('is logged once when the sweep re-enters it with its original timestamp', () => {
    // logged live over the socket at 12:19
    let s = hudReducer(initialHudState, { type: 'frame', frame: greeting, at: 1219 });
    // the user says something, and is answered — so the copy will not be adjacent
    s = hudReducer(s, { type: 'local_command', text: "what's on screen", at: 1220 });
    s = hudReducer(s, {
      type: 'frame',
      frame: { kind: 'status', status: 'speaking', message: "I can't see your screen.", user: null },
      at: 1221,
    });
    // now the tray sweep re-enters the 12:19 reply, stamped 12:19
    s = hudReducer(s, { type: 'frame', frame: greeting, at: 1219 });

    expect(s.chat.filter((c) => c.text === 'Standing by, Sir.')).toHaveLength(1);
  });

  it('leaves the log in the order things actually happened', () => {
    let s = hudReducer(initialHudState, { type: 'frame', frame: greeting, at: 1219 });
    s = hudReducer(s, { type: 'local_command', text: "what's on screen", at: 1220 });
    s = hudReducer(s, {
      type: 'frame',
      frame: { kind: 'status', status: 'speaking', message: "I can't see your screen.", user: null },
      at: 1221,
    });
    s = hudReducer(s, { type: 'frame', frame: greeting, at: 1219 });

    expect(s.chat.map((c) => c.at)).toEqual([1219, 1220, 1221]);
  });

  it('still logs the same answer twice when it genuinely happened twice', () => {
    // the behaviour the consecutive guard was written to preserve: a repeated answer
    // with its own timestamp is a second thing that was said, not an echo
    let s = hudReducer(initialHudState, { type: 'frame', frame: greeting, at: 1219 });
    s = hudReducer(s, { type: 'local_command', text: 'you there?', at: 40000 });
    s = hudReducer(s, { type: 'frame', frame: greeting, at: 41000 });

    expect(s.chat.filter((c) => c.text === 'Standing by, Sir.')).toHaveLength(2);
  });

  /**
   * The duplicates already written to disk have to go too, or the fix is invisible.
   *
   * `hydrate` de-duplicated the restored log against what was already in state and never
   * against itself, so a log that was persisted while the bug was live comes back with
   * both copies intact — the phone would show the same wrong screen after the fix
   * shipped, which reads exactly like a fix that did not work.
   */
  it('drops a duplicate that is already inside the restored log', () => {
    const s = hudReducer(initialHudState, {
      type: 'hydrate',
      chat: [
        { from: 'jarvis', text: 'Standing by, Sir.', at: 1219 },
        { from: 'user', text: "what's on screen", at: 1220 },
        { from: 'jarvis', text: "I can't see your screen.", at: 1221 },
        { from: 'jarvis', text: 'Standing by, Sir.', at: 1219 },
      ],
    });
    expect(s.chat.map((c) => c.at)).toEqual([1219, 1220, 1221]);
  });

  it('keeps two restored turns that only look alike', () => {
    // same words, different moments — a real repeat, and it survives the restore
    const s = hudReducer(initialHudState, {
      type: 'hydrate',
      chat: [
        { from: 'jarvis', text: 'Standing by, Sir.', at: 1219 },
        { from: 'jarvis', text: 'Standing by, Sir.', at: 41000 },
      ],
    });
    expect(s.chat).toHaveLength(2);
  });

  /**
   * The real numbers, read off the device on 2026-08-24 with a temporary audit.
   *
   * The exact-millisecond key shipped first and did not clear the screen, because the two
   * copies are not in the same millisecond:
   *
   * ```
   * 97 jarvis at=1787392364989 len=273 h=12mc64f
   * 99 jarvis at=1787392364530 len=273 h=12mc64f   <- 459 ms EARLIER, appended later
   * 85 jarvis at=1787381385363 len=17  h=1amiqwh
   * 88 jarvis at=1787381384941 len=17  h=1amiqwh   <- 422 ms earlier, appended later
   * ```
   *
   * The push carries the notification's own time and the socket stamps arrival, so the
   * same reply lands twice a few hundred milliseconds apart — and the copy sorts *before*
   * its original while sitting *after* it in the log.
   *
   * The window is safe by a wide margin rather than by taste. In the same 100-entry log,
   * every genuine repeat is far apart: the closest is 32.9 s (two identical sends by the
   * user), then 65.9 s, then 72.5 s. Duplicates are 422–459 ms. Five seconds sits ~11×
   * above the largest duplicate and ~6.6× below the closest real repeat.
   */
  it('collapses a copy that arrives a few hundred milliseconds off', () => {
    const long = 'x'.repeat(273);
    let s = hudReducer(initialHudState, {
      type: 'frame',
      frame: { kind: 'status', status: 'speaking', message: long, user: null },
      at: 1787392364989,
    });
    s = hudReducer(s, { type: 'local_command', text: 'something else', at: 1787392400000 });
    // the tray sweep re-enters it with the notification's own, earlier stamp
    s = hudReducer(s, {
      type: 'frame',
      frame: { kind: 'status', status: 'speaking', message: long, user: null },
      at: 1787392364530,
    });
    expect(s.chat.filter((c) => c.text === long)).toHaveLength(1);
  });

  it('keeps the same words said again half a minute later', () => {
    // 32.9 s apart is the closest genuine repeat in the real log, and it must survive
    let s = hudReducer(initialHudState, {
      type: 'frame',
      frame: { kind: 'status', status: 'speaking', message: 'Standing by, Sir.', user: null },
      at: 1787351752535,
    });
    s = hudReducer(s, { type: 'local_command', text: 'you there?', at: 1787351760000 });
    s = hudReducer(s, {
      type: 'frame',
      frame: { kind: 'status', status: 'speaking', message: 'Standing by, Sir.', user: null },
      at: 1787351785436,
    });
    expect(s.chat.filter((c) => c.text === 'Standing by, Sir.')).toHaveLength(2);
  });

  it('clears the near-miss duplicates already sitting in a restored log', () => {
    const long = 'x'.repeat(273);
    const s = hudReducer(initialHudState, {
      type: 'hydrate',
      chat: [
        { from: 'jarvis', text: long, at: 1787392364989 },
        { from: 'jarvis', text: 'a later thing', at: 1787392720472 },
        { from: 'jarvis', text: long, at: 1787392364530 },
      ],
    });
    expect(s.chat).toHaveLength(2);
    expect(s.chat.filter((c) => c.text === long)).toHaveLength(1);
  });

  it('does not collapse a near-miss from the other side of the conversation', () => {
    // same words within the window but a different speaker is a different event
    let s = hudReducer(initialHudState, {
      type: 'local_command',
      text: 'Standing by, Sir.',
      at: 1787392364530,
    });
    s = hudReducer(s, {
      type: 'frame',
      frame: { kind: 'status', status: 'speaking', message: 'Standing by, Sir.', user: null },
      at: 1787392364989,
    });
    expect(s.chat).toHaveLength(2);
  });

  it('still collapses the greeting repeated back to back on a re-dial', () => {
    // unchanged: the phone re-dials on foreground, network change and watchdog, and
    // the gateway greets every connection
    let s = hudReducer(initialHudState, { type: 'frame', frame: greeting, at: 1219 });
    s = hudReducer(s, { type: 'frame', frame: greeting, at: 1220 });

    expect(s.chat).toHaveLength(1);
  });
});
