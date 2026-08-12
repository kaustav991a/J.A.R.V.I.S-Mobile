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

/**
 * Someone is at the desk. The desk grabbed a webcam frame and is counting down
 * to locking itself; this is the phone being asked whether that was you.
 */
export type IntruderFrame = {
  kind: 'intruder';
  id: string;
  /**
   * Seconds left when the desk sent this, not a wall-clock deadline. The phone
   * counts down from receipt, so the two machines never have to agree on the
   * time — and the desk's copy of this clock is the authoritative one.
   */
  expiresIn: number;
  /** path on the desk to GET the mugshot; null if the capture failed */
  image: string | null;
  /** the Windows account that was active */
  user: string | null;
  /** what prompted the capture: `unlock`, `wake`, `hello_failed` */
  trigger: string;
};

/**
 * The window closed. Sent whether the phone answered, the desk timed out, or
 * the desk was told from somewhere else — so a stale alert can never sit on the
 * phone claiming to still be live.
 */
export type IntruderResolvedFrame = {
  kind: 'intruder_resolved';
  id: string;
  /** `approved` — it was you. `locked` — denied, or the window expired. */
  outcome: 'approved' | 'locked';
};

/**
 * What the desk heard you say. Sent after a voice clip is transcribed, and kept
 * separate from `status` on purpose: a transcript delivered as a status message
 * would be appended to the chat log as J.A.R.V.I.S. having said it, which
 * misattributes your own words to the machine.
 */
export type TranscriptFrame = { kind: 'transcript'; text: string };

export type JarvisFrame =
  | TranscriptFrame
  | StatusFrame
  | TelemetryFrame
  | WeatherFrame
  | AgentStepFrame
  | ParkedFrame
  | ConfirmFrame
  | IntruderFrame
  | IntruderResolvedFrame;

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
  // The desk sends `cpu_percent` / `ram_percent` / `disk_percent` — that is what
  // `sensors.get_system_telemetry()` has always returned, and the web HUD reads
  // those names. The short names here came from the spec, so every telemetry
  // frame from a real desk was silently coerced to `{}` and the Vitals panel sat
  // empty against a machine that was reporting fine. Both spellings are accepted
  // rather than renaming either end.
  const cpu = num(o.cpu) ?? num(o.cpu_percent);
  if (cpu !== null) data.cpu = cpu;
  const mem = num(o.mem) ?? num(o.ram_percent);
  if (mem !== null) data.mem = mem;
  const disk = num(o.disk) ?? num(o.disk_percent);
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
    case 'transcript': {
      const text = str(o.text).trim();
      // an empty transcript is not something you said — drop it rather than
      // writing a blank line into the chat log
      return text ? { kind: 'transcript', text } : null;
    }
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
    case 'intruder': {
      // An alert with no id cannot be answered — approve would have nothing to
      // name — and one already out of time must not raise a live countdown.
      const id = identity(o);
      const expiresIn = num(o.expires_in);
      if (!id || expiresIn === null || expiresIn <= 0) return null;
      return {
        kind: 'intruder',
        id,
        expiresIn,
        image: str(o.image) || null,
        user: str(o.user) || null,
        trigger: str(o.trigger, 'unlock'),
      };
    }
    case 'intruder_resolved': {
      const id = identity(o);
      if (!id) return null;
      // anything that is not an explicit approval closes the alert as locked:
      // a garbled outcome must not read as "it was you"
      return { kind: 'intruder_resolved', id, outcome: str(o.outcome) === 'approved' ? 'approved' : 'locked' };
    }
  }

  if (typeof o.status === 'string') {
    return { kind: 'status', status: o.status, message: str(o.message), user: str(o.user) || null };
  }

  return null;
}
