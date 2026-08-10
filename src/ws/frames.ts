export type TelemetryData = {
  cpu?: number;
  mem?: number;
  disk?: number;
  gpu?: number | null;
  temp?: number | null;
  battery?: number | null;
  net_up?: number;
  net_down?: number;
};

export type WeatherData = {
  temp?: number;
  desc?: string;
  city?: string;
  icon?: string;
};

export type StatusFrame = { kind: 'status'; status: string; message: string; user: string | null };
export type TelemetryFrame = { kind: 'telemetry'; data: TelemetryData };
export type WeatherFrame = { kind: 'weather'; data: WeatherData };
export type AgentStepFrame = {
  kind: 'agent_step';
  goal: string;
  event: string;
  detail: string;
  step: number | null;
};
export type ParkedFrame = {
  kind: 'agent_parked';
  id: string;
  goal: string;
  action: string;
  detail: string;
  risk: string;
};
export type ConfirmFrame = {
  kind: 'agent_confirm';
  id: string;
  action: string;
  resolved: boolean;
  approved: boolean;
};

export type JarvisFrame =
  | StatusFrame
  | TelemetryFrame
  | WeatherFrame
  | AgentStepFrame
  | ParkedFrame
  | ConfirmFrame;

type Obj = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);
const obj = (v: unknown): Obj => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

/** parked/confirm identifiers have three known spellings across the backend. */
const identity = (o: Obj): string => str(o.id) || str(o.action_id) || str(o.request_id);

/**
 * Coerce a raw telemetry `data` payload field-by-field through `num()`
 * instead of a bare type assertion — a mistyped field (e.g. cpu sent as a
 * string) is dropped rather than handed downstream typed as `number`.
 * A field absent from the payload stays absent, matching the old
 * pass-through behaviour exactly.
 */
const coerceTelemetry = (o: Obj): TelemetryData => {
  const data: TelemetryData = {};
  const cpu = num(o.cpu);
  if (cpu !== null) data.cpu = cpu;
  const mem = num(o.mem);
  if (mem !== null) data.mem = mem;
  const disk = num(o.disk);
  if (disk !== null) data.disk = disk;
  if (o.gpu !== undefined) data.gpu = num(o.gpu);
  if (o.temp !== undefined) data.temp = num(o.temp);
  if (o.battery !== undefined) data.battery = num(o.battery);
  const netUp = num(o.net_up);
  if (netUp !== null) data.net_up = netUp;
  const netDown = num(o.net_down);
  if (netDown !== null) data.net_down = netDown;
  return data;
};

/**
 * Coerce a raw weather `data` payload field-by-field through `num()` /
 * `str()` instead of a bare type assertion — see `coerceTelemetry`.
 */
const coerceWeather = (o: Obj): WeatherData => {
  const data: WeatherData = {};
  const temp = num(o.temp);
  if (temp !== null) data.temp = temp;
  if (typeof o.desc === 'string') data.desc = str(o.desc);
  if (typeof o.city === 'string') data.city = str(o.city);
  if (typeof o.icon === 'string') data.icon = str(o.icon);
  return data;
};

/**
 * Normalise one wire frame. Returns null for frames the phone deliberately
 * ignores (gesture_state, ui_state), for unknown frame types, and for
 * anything unparseable — a bad frame must never take the socket down.
 */
export function parseFrame(raw: string | unknown): JarvisFrame | null {
  let o: Obj;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      o = obj(parsed);
    } catch {
      return null;
    }
  } else {
    o = obj(raw);
  }
  if (Object.keys(o).length === 0) return null;

  const type = str(o.type);

  if (type === 'gesture_state' || type === 'ui_state') return null;

  if (o.status === 'sync') {
    if (type === 'telemetry') return { kind: 'telemetry', data: coerceTelemetry(obj(o.data)) };
    if (type === 'weather') return { kind: 'weather', data: coerceWeather(obj(o.data)) };
    return null;
  }

  switch (type) {
    case 'agent_step':
      return {
        kind: 'agent_step',
        goal: str(o.goal),
        event: str(o.event),
        detail: str(o.detail),
        step: num(o.step),
      };
    case 'agent_parked':
      return {
        kind: 'agent_parked',
        id: identity(o),
        goal: str(o.goal),
        action: str(o.action),
        detail: str(o.detail),
        risk: str(o.risk),
      };
    case 'agent_confirm':
      return {
        kind: 'agent_confirm',
        id: identity(o),
        action: str(o.action),
        resolved: bool(o.resolved),
        approved: bool(o.approved),
      };
  }

  if (typeof o.status === 'string') {
    return { kind: 'status', status: o.status, message: str(o.message), user: str(o.user) || null };
  }

  return null;
}
