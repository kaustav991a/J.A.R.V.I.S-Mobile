import { JarvisFrame, TelemetryData, WeatherData } from '../ws/frames';
import { TraceEntry, ParkedAction } from './types';

// `TraceEntry` and `ParkedAction` were declared in `./types` ahead of this
// reducer (components needed them before the reducer existed). Re-export
// rather than redeclare so both this module's stated interface and the
// existing component imports keep working.
export type { TraceEntry, ParkedAction } from './types';

const TRACE_CAP = 50;
const CHAT_CAP = 100;

export type ChatEntry = { from: 'jarvis' | 'user'; text: string; at: number };

export type HudState = {
  status: string;
  message: string;
  user: string | null;
  telemetry: TelemetryData | null;
  weather: WeatherData | null;
  trace: TraceEntry[];
  chat: ChatEntry[];
  parked: ParkedAction[];
  lastFrameAt: number | null;
};

export type HudAction =
  | { type: 'frame'; frame: JarvisFrame; at: number }
  | { type: 'local_command'; text: string; at: number }
  | { type: 'resolving'; id: string }
  | { type: 'resolved_local'; id: string }
  | { type: 'reset' };

export const initialHudState: HudState = {
  status: 'boot',
  message: '',
  user: null,
  telemetry: null,
  weather: null,
  trace: [],
  chat: [],
  parked: [],
  lastFrameAt: null,
};

const cap = <T,>(list: T[], max: number): T[] => (list.length > max ? list.slice(list.length - max) : list);

const upsertParked = (parked: ParkedAction[], next: ParkedAction): ParkedAction[] => {
  const i = parked.findIndex((p) => p.id === next.id);
  if (i === -1) return [...parked, next];
  const copy = parked.slice();
  copy[i] = { ...copy[i], ...next, resolving: copy[i].resolving };
  return copy;
};

function applyFrame(state: HudState, frame: JarvisFrame, at: number): HudState {
  switch (frame.kind) {
    case 'status':
      return {
        ...state,
        status: frame.status,
        message: frame.message,
        user: frame.user ?? state.user,
        chat: frame.message
          ? cap([...state.chat, { from: 'jarvis' as const, text: frame.message, at }], CHAT_CAP)
          : state.chat,
      };
    case 'telemetry':
      return { ...state, telemetry: { ...(state.telemetry ?? {}), ...frame.data } };
    case 'weather':
      return { ...state, weather: frame.data };
    case 'agent_step':
      return {
        ...state,
        trace: cap(
          [...state.trace, { goal: frame.goal, event: frame.event, detail: frame.detail, step: frame.step, at }],
          TRACE_CAP
        ),
      };
    case 'agent_parked':
      return {
        ...state,
        parked: upsertParked(state.parked, {
          id: frame.id,
          goal: frame.goal,
          action: frame.action,
          detail: frame.detail,
          risk: frame.risk,
          at,
          resolving: false,
        }),
      };
    case 'agent_confirm':
      if (frame.resolved) {
        return { ...state, parked: state.parked.filter((p) => p.id !== frame.id) };
      }
      return {
        ...state,
        parked: upsertParked(state.parked, {
          id: frame.id,
          goal: '',
          action: frame.action,
          detail: '',
          risk: '',
          at,
          resolving: false,
        }),
      };
  }
}

export function hudReducer(state: HudState, action: HudAction): HudState {
  switch (action.type) {
    case 'frame':
      return { ...applyFrame(state, action.frame, action.at), lastFrameAt: action.at };
    case 'local_command':
      return {
        ...state,
        chat: cap([...state.chat, { from: 'user' as const, text: action.text, at: action.at }], CHAT_CAP),
      };
    case 'resolving':
      return {
        ...state,
        parked: state.parked.map((p) => (p.id === action.id ? { ...p, resolving: true } : p)),
      };
    case 'resolved_local':
      return { ...state, parked: state.parked.filter((p) => p.id !== action.id) };
    case 'reset':
      return initialHudState;
  }
}
