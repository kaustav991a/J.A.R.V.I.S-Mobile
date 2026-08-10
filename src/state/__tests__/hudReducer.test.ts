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
    const s = feed([{ kind: 'status', status: 'online', message: 'Systems nominal', user: 'sir' }]);
    expect(s.status).toBe('online');
    expect(s.message).toBe('Systems nominal');
    expect(s.user).toBe('sir');
    expect(s.chat).toEqual([{ from: 'jarvis', text: 'Systems nominal', at: 1000 }]);
    expect(s.lastFrameAt).toBe(1000);
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
    expect(s.chat[0]).toEqual({ from: 'user', text: 'cmd-20', at: 2020 });
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
});
