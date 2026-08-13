import { parseFrame } from '../frames';
import type { TelemetryData, WeatherData } from '../frames';

const j = (o: unknown) => JSON.stringify(o);

describe('parseFrame', () => {
  it('parses a status frame', () => {
    expect(parseFrame(j({ status: 'online', message: 'Systems nominal', user: 'sir' }))).toEqual({
      kind: 'status',
      status: 'online',
      message: 'Systems nominal',
      user: 'sir',
    });
  });

  it('defaults a status frame with no message or user', () => {
    expect(parseFrame(j({ status: 'thinking' }))).toEqual({
      kind: 'status',
      status: 'thinking',
      message: '',
      user: null,
    });
  });

  it('parses sync/telemetry into a telemetry frame', () => {
    const f = parseFrame(j({ status: 'sync', type: 'telemetry', data: { cpu: 34, mem: 61 } }));
    expect(f).toEqual({ kind: 'telemetry', data: { cpu: 34, mem: 61 } });
  });

  it('parses sync/weather into a weather frame', () => {
    const f = parseFrame(j({ status: 'sync', type: 'weather', data: { temp: 31, desc: 'haze' } }));
    expect(f).toEqual({ kind: 'weather', data: { temp: 31, desc: 'haze' } });
  });

  it('parses an agent_step frame', () => {
    const f = parseFrame(j({ type: 'agent_step', goal: 'tidy downloads', event: 'thinking', detail: 'listing files', step: 2 }));
    expect(f).toEqual({ kind: 'agent_step', goal: 'tidy downloads', event: 'thinking', detail: 'listing files', step: 2 });
  });

  it('parses an agent_parked frame', () => {
    const f = parseFrame(j({ type: 'agent_parked', id: 'a1', goal: 'tidy downloads', action: 'delete 3 files', detail: 'x.tmp, y.tmp, z.tmp', risk: 'high' }));
    expect(f).toEqual({
      kind: 'agent_parked',
      id: 'a1',
      goal: 'tidy downloads',
      action: 'delete 3 files',
      detail: 'x.tmp, y.tmp, z.tmp',
      risk: 'high',
    });
  });

  it('accepts action_id or request_id as the parked identifier', () => {
    expect(parseFrame(j({ type: 'agent_parked', action_id: 'a2', action: 'run script' }))).toMatchObject({ kind: 'agent_parked', id: 'a2' });
    expect(parseFrame(j({ type: 'agent_parked', request_id: 'a3', action: 'run script' }))).toMatchObject({ kind: 'agent_parked', id: 'a3' });
  });

  it('parses an agent_confirm frame with a resolution', () => {
    const f = parseFrame(j({ type: 'agent_confirm', id: 'a1', resolved: true, approved: false }));
    expect(f).toEqual({ kind: 'agent_confirm', id: 'a1', resolved: true, approved: false, action: '' });
  });

  it('ignores desk-only frames', () => {
    expect(parseFrame(j({ type: 'gesture_state', hand: 'open' }))).toBeNull();
    expect(parseFrame(j({ type: 'ui_state', panel: 'vitals' }))).toBeNull();
  });

  it('ignores unknown frames and malformed json instead of throwing', () => {
    expect(parseFrame(j({ type: 'something_new' }))).toBeNull();
    expect(parseFrame('not json at all')).toBeNull();
    expect(parseFrame(j([1, 2, 3]))).toBeNull();
    expect(parseFrame(undefined)).toBeNull();
  });

  it('tolerates unknown extra keys on a known frame', () => {
    const f = parseFrame(j({ status: 'online', message: 'hi', future_field: 42 }));
    expect(f).toMatchObject({ kind: 'status', status: 'online' });
  });

  it('drops a wrong-typed telemetry cpu instead of leaking it through as a string', () => {
    const f = parseFrame(j({ status: 'sync', type: 'telemetry', data: { cpu: '34', mem: 61 } }));
    expect(f).toEqual({ kind: 'telemetry', data: { mem: 61 } });
    expect((f as { kind: 'telemetry'; data: TelemetryData }).data.cpu).toBeUndefined();
  });

  it('drops a wrong-typed weather desc instead of leaking it through as a number', () => {
    const f = parseFrame(j({ status: 'sync', type: 'weather', data: { temp: 31, desc: 42 } }));
    expect(f).toEqual({ kind: 'weather', data: { temp: 31 } });
    expect((f as { kind: 'weather'; data: WeatherData }).data.desc).toBeUndefined();
  });

  describe('intruder alerts', () => {
    const alert = (extra: Record<string, unknown> = {}) =>
      parseFrame(
        j({
          type: 'intruder',
          id: 'i-1',
          expires_in: 30,
          image: '/api/intruder/i-1.jpg',
          user: 'KAUSTAV',
          trigger: 'unlock',
          ...extra,
        })
      );

    it('reads a capture the desk is counting down on', () => {
      expect(alert()).toEqual({
        kind: 'intruder',
        id: 'i-1',
        expiresIn: 30,
        image: '/api/intruder/i-1.jpg',
        user: 'KAUSTAV',
        trigger: 'unlock',
      });
    });

    it('still raises the alert when the camera grabbed nothing', () => {
      // no mugshot is not a reason to stay quiet — the desk is still locking
      expect(alert({ image: undefined })).toMatchObject({ kind: 'intruder', image: null });
    });

    it('assumes an unlock when the desk does not say what it saw', () => {
      expect(alert({ trigger: undefined })).toMatchObject({ trigger: 'unlock' });
    });

    it('drops an alert with no id — approve would have nothing to name', () => {
      expect(alert({ id: undefined })).toBeNull();
    });

    it('drops an alert that is already out of time', () => {
      // a live countdown drawn from a dead window is a lie about the desk
      expect(alert({ expires_in: 0 })).toBeNull();
      expect(alert({ expires_in: -4 })).toBeNull();
      expect(alert({ expires_in: undefined })).toBeNull();
      expect(alert({ expires_in: '30' })).toBeNull();
    });

    it('accepts the other two spellings of the id, as the parked frames do', () => {
      expect(alert({ id: undefined, action_id: 'a-9' })).toMatchObject({ id: 'a-9' });
      expect(alert({ id: undefined, request_id: 'r-9' })).toMatchObject({ id: 'r-9' });
    });

    it('reads a resolution either way', () => {
      expect(parseFrame(j({ type: 'intruder_resolved', id: 'i-1', outcome: 'approved' }))).toEqual({
        kind: 'intruder_resolved',
        id: 'i-1',
        outcome: 'approved',
      });
      expect(parseFrame(j({ type: 'intruder_resolved', id: 'i-1', outcome: 'locked' }))).toMatchObject({
        outcome: 'locked',
      });
    });

    it('treats any outcome that is not an explicit approval as locked', () => {
      // a garbled outcome must never read as "it was you"
      for (const outcome of [undefined, '', 'APPROVED', 'yes', 42]) {
        expect(parseFrame(j({ type: 'intruder_resolved', id: 'i-1', outcome }))).toMatchObject({ outcome: 'locked' });
      }
    });

    it('drops a resolution that names no alert', () => {
      expect(parseFrame(j({ type: 'intruder_resolved', outcome: 'approved' }))).toBeNull();
    });
  });

  describe('telemetry from a real desk', () => {
    it('is read under the names the desk actually sends', () => {
      // sensors.get_system_telemetry() has always returned cpu_percent /
      // ram_percent / disk_percent, and the web HUD reads those. Only the spec
      // ever said cpu/mem/disk, so every frame from a live desk used to coerce
      // to {} and the Vitals panel sat empty against a healthy machine.
      expect(
        parseFrame(
          j({
            status: 'sync',
            type: 'telemetry',
            data: { cpu_percent: 12.5, ram_percent: 48, disk_percent: 71.2, uptime_hours: 3 },
          })
        )
      ).toEqual({ kind: 'telemetry', data: { cpu: 12.5, mem: 48, disk: 71.2 } });
    });

    it('still reads the short names, so neither end had to be renamed', () => {
      expect(parseFrame(j({ status: 'sync', type: 'telemetry', data: { cpu: 9, mem: 20, disk: 30 } }))).toEqual({
        kind: 'telemetry',
        data: { cpu: 9, mem: 20, disk: 30 },
      });
    });

    it('prefers the short name when a frame somehow carries both', () => {
      expect(
        parseFrame(j({ status: 'sync', type: 'telemetry', data: { cpu: 9, cpu_percent: 88 } }))
      ).toEqual({ kind: 'telemetry', data: { cpu: 9 } });
    });
  });

  describe('a voice transcript', () => {
    it('is its own frame, so it can be logged as him speaking', () => {
      // sent as a status message it would be appended to the chat as J.A.R.V.I.S.
      // having said it — a lie about who spoke
      expect(parseFrame(j({ type: 'transcript', text: '  kal ki hobe  ' }))).toEqual({
        kind: 'transcript',
        text: 'kal ki hobe',
      });
    });

    it('is dropped when empty, rather than writing a blank chat line', () => {
      expect(parseFrame(j({ type: 'transcript', text: '   ' }))).toBeNull();
      expect(parseFrame(j({ type: 'transcript' }))).toBeNull();
    });
  });

  describe('the desk attaching to the gateway', () => {
    it('reads both directions', () => {
      expect(parseFrame(j({ type: 'desk', linked: true }))).toEqual({ kind: 'desk_link', linked: true });
      expect(parseFrame(j({ type: 'desk', linked: false }))).toEqual({ kind: 'desk_link', linked: false });
    });

    it('is dropped when it does not say which way', () => {
      // absent or mistyped, `linked` must not fall through to false: reading a
      // malformed frame as "the desk went away" would strip PC control from a
      // session that still has it
      expect(parseFrame(j({ type: 'desk' }))).toBeNull();
      expect(parseFrame(j({ type: 'desk', linked: 'yes' }))).toBeNull();
    });
  });
});
