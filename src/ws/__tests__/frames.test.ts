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
});
