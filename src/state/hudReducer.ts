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

/**
 * A live desk-watch alert. At most one: the desk locks itself when the window
 * closes, so it can only ever be waiting on one answer.
 */
export type IntruderAlert = {
  id: string;
  /**
   * Epoch ms, worked out from the frame's `expiresIn` at the moment it landed.
   * The desk sends a duration rather than a timestamp precisely so this sum is
   * the only place the two clocks meet.
   */
  deadline: number;
  image: string | null;
  user: string | null;
  trigger: string;
  /** true between tapping APPROVE and the desk confirming */
  resolving: boolean;
};

export type HudState = {
  status: string;
  message: string;
  user: string | null;
  telemetry: TelemetryData | null;
  weather: WeatherData | null;
  trace: TraceEntry[];
  chat: ChatEntry[];
  parked: ParkedAction[];
  intruder: IntruderAlert | null;
  /**
   * Whether the cloud gateway currently has the desk attached — full power,
   * PC control and all — as opposed to answering out of the light cloud brain.
   *
   * `null` means nobody has said: a LAN session, or a cloud session that has not
   * been told yet. It is deliberately not `false`, because "the desk is off" is a
   * claim, and this app does not make claims it has not been given.
   */
  deskLinked: boolean | null;
  lastFrameAt: number | null;
};

export type HudAction =
  | { type: 'frame'; frame: JarvisFrame; at: number }
  | { type: 'local_command'; text: string; at: number }
  | { type: 'resolving'; id: string }
  | { type: 'resolved_local'; id: string }
  | { type: 'intruder_resolving'; id: string }
  /** the countdown ran out on the phone with no answer from the desk */
  | { type: 'intruder_expired'; id: string; at: number }
  /**
   * The stored conversation, read at launch.
   *
   * Prepended rather than replacing: the socket can open and answer before the
   * disk read finishes, and a restore that overwrote would delete a turn that had
   * already happened. Anything already in state is newer by definition.
   */
  | { type: 'hydrate'; chat: ChatEntry[] }
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
  intruder: null,
  deskLinked: null,
  lastFrameAt: null,
};

/** the desk watch writes to the same timeline the agent trace uses */
const WATCH = 'Desk watch';

/**
 * What the desk watch says out loud when a window closes.
 *
 * Every outcome states the machine's resulting state in plain words, because
 * "approved" does not tell you whether the desk is now open or shut — and that is
 * the only thing you actually want to know afterwards.
 */
const WATCH_SAID = {
  approved: 'That was you — the desk is still unlocked.',
  locked: 'Desk locked. Windows will ask for your PIN.',
  expired: 'No answer in time, so I locked the desk. Windows will ask for your PIN.',
} as const;

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
    case 'desk_link':
      // no chat line either way. The desk arriving is a change in what this
      // session can do, not something J.A.R.V.I.S. said — the pill and the
      // notification carry it, and a log line here would be the machine
      // narrating its own plumbing
      return { ...state, deskLinked: frame.linked };
    case 'transcript':
      // from: 'user' — these are his words coming back, not the machine's. Typed
      // commands get the same entry locally via `local_command`; a spoken one has
      // no local text to log, so the transcript is the only place it appears.
      return {
        ...state,
        chat: cap([...state.chat, { from: 'user' as const, text: frame.text, at }], CHAT_CAP),
      };
    case 'status': {
      /**
       * The same status twice in a row is not a second thing that happened.
       *
       * The gateway greets every connection with a line stating what this session
       * can do — "Cloud brain only, so PC control is off until the desk wakes." —
       * and the phone re-dials on every return to the foreground, every network
       * change, and every watchdog fire. Appending each greeting turned the log
       * into a column of the identical sentence with nothing said between them.
       *
       * Only *consecutive* duplicates are dropped, and only from J.A.R.V.I.S.:
       * asking the same thing twice is a real thing a person does, and the same
       * answer arriving after something else was said is information.
       */
      const last = state.chat[state.chat.length - 1];
      const repeated = last?.from === 'jarvis' && last.text === frame.message;
      /**
       * `online` and `offline` are the link talking about itself, not
       * J.A.R.V.I.S. saying something.
       *
       * The gateway greets every connection with "Cloud brain only, so PC control
       * is off until the desk wakes." — true, useful, and not a conversational
       * turn. It belongs where the link state is already shown: the Connection
       * screen and Home's status card. In the chat it was a sentence the machine
       * appeared to volunteer, unprompted, every time the socket moved.
       *
       * Everything else keeps its message. `speaking` is an answer, `waking`
       * carries the desk's briefing, `error` is what went wrong — all of them are
       * things that were said.
       */
      const linkNotice = frame.status === 'online' || frame.status === 'offline';
      return {
        ...state,
        status: frame.status,
        message: frame.message,
        user: frame.user ?? state.user,
        chat:
          frame.message && !repeated && !linkNotice
            ? cap([...state.chat, { from: 'jarvis' as const, text: frame.message, at }], CHAT_CAP)
            : state.chat,
      };
    }
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
    case 'intruder':
      return {
        ...state,
        intruder: {
          id: frame.id,
          deadline: at + frame.expiresIn * 1000,
          image: frame.image,
          user: frame.user,
          trigger: frame.trigger,
          resolving: false,
        },
        trace: cap(
          [
            ...state.trace,
            { goal: WATCH, event: 'seen', detail: `Someone at the desk (${frame.trigger})`, step: null, at },
          ],
          TRACE_CAP
        ),
      };
    case 'intruder_resolved':
      return {
        ...state,
        // a resolution for some other alert must not clear the live one
        intruder: state.intruder && state.intruder.id !== frame.id ? state.intruder : null,
        // the outcome is said in Chat as well as logged: the timeline is a place
        // you have to go looking, and afterwards the one thing worth knowing is
        // whether the machine is open or shut
        chat: cap([...state.chat, { from: 'jarvis' as const, text: WATCH_SAID[frame.outcome], at }], CHAT_CAP),
        trace: cap(
          [
            ...state.trace,
            {
              goal: WATCH,
              event: frame.outcome,
              detail: frame.outcome === 'approved' ? 'Confirmed as you' : 'Desk locked',
              step: null,
              at,
            },
          ],
          TRACE_CAP
        ),
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
    case 'intruder_resolving':
      return {
        ...state,
        intruder:
          state.intruder && state.intruder.id === action.id ? { ...state.intruder, resolving: true } : state.intruder,
      };
    case 'intruder_expired':
      // The phone's clock ran out. It does not decide anything — the desk owns
      // the countdown and locks itself — but the alert stops claiming to be
      // answerable, so nobody taps APPROVE into a closed window.
      if (!state.intruder || state.intruder.id !== action.id) return state;
      return {
        ...state,
        intruder: null,
        chat: cap([...state.chat, { from: 'jarvis' as const, text: WATCH_SAID.expired, at: action.at }], CHAT_CAP),
        trace: cap(
          [
            ...state.trace,
            { goal: WATCH, event: 'locked', detail: 'No answer in time — desk locked', step: null, at: action.at },
          ],
          TRACE_CAP
        ),
      };
    case 'hydrate': {
      if (action.chat.length === 0) return state;
      // Restored turns go BEFORE whatever is already here. The socket can open and
      // J.A.R.V.I.S. can answer before a disk read finishes, and replacing would
      // throw away a turn that had already happened in this session.
      // De-duplicated on (from, at): a relaunch that restores a log and then
      // receives the same greeting again should not show it twice.
      const seen = new Set(state.chat.map((c) => `${c.from}@${c.at}`));
      const restored = action.chat.filter((c) => !seen.has(`${c.from}@${c.at}`));
      return { ...state, chat: cap([...restored, ...state.chat], CHAT_CAP) };
    }
    case 'reset':
      return initialHudState;
  }
}
