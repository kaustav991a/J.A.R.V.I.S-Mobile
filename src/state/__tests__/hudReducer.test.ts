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
    const said = { kind: 'status' as const, status: 'speaking', message: 'Working on it.', user: null };
    let s = hudReducer(initialHudState, { type: 'frame', frame: said, at: 1 });
    s = hudReducer(s, { type: 'local_command', text: 'what time is it', at: 2 });
    s = hudReducer(s, { type: 'frame', frame: said, at: 3 });
    expect(s.chat.map((c) => c.at)).toEqual([1, 2, 3]);
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
