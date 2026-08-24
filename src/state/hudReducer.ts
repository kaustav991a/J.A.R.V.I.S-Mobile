import { JarvisFrame, TelemetryData, WeatherData } from '../ws/frames';
import { TraceEntry, ParkedAction } from './types';

// `TraceEntry` and `ParkedAction` were declared in `./types` ahead of this
// reducer (components needed them before the reducer existed). Re-export
// rather than redeclare so both this module's stated interface and the
// existing component imports keep working.
export type { TraceEntry, ParkedAction } from './types';

const TRACE_CAP = 50;
const CHAT_CAP = 100;

export type ChatEntry = {
  from: 'jarvis' | 'user';
  text: string;
  at: number;
  /**
   * A local `file://` uri for a photo this turn sent.
   *
   * Optional and absent rather than undefined on an ordinary turn: the chat is
   * persisted, and a key that means nothing would round-trip on every entry ever
   * written.
   *
   * It can also stop resolving. The uri points into the app's cache, which
   * Android is entitled to clear, so anything rendering this needs a fallback for
   * a picture that is simply no longer there — the record of *having sent one*
   * survives in `text` either way.
   */
  image?: string;
  /**
   * What became of a turn you sent. Absent on Jarvis's own turns, and absent on
   * anything restored from a log written before this existed — a fortnight of old
   * messages redrawn as "sending" would be a lie about every one of them.
   *
   * `awaiting` is the interesting one and the reason this exists at all: it means
   * something carried the message and no answer has come back. That is the state a
   * dropped reply leaves behind, and until now it was indistinguishable on screen
   * from a reply still being written.
   */
  state?: 'sending' | 'awaiting' | 'failed' | 'answered';
};

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
  | { type: 'local_command'; text: string; at: number; image?: string }
  /** something carried the turn stamped `at`; the wait for an answer starts */
  | { type: 'turn_sent'; at: number }
  /** nothing could carry it, so there is nothing to wait for */
  | { type: 'turn_failed'; at: number }
  /**
   * Withdraw a failed attempt, because it is being sent again.
   *
   * Only a `failed` turn can be withdrawn. Anything that reached the far end is part
   * of the record whatever became of its answer, and quietly deleting it would let
   * the log disagree with what the desk actually received.
   */
  | { type: 'turn_drop'; at: number }
  /**
   * Take one of the user's own turns out, because they asked.
   *
   * Distinct from `turn_drop`, which withdraws a failed attempt about to be retried.
   * This removes a turn in any state, including one the desk received — the user
   * gets to decide what stays in their own log.
   *
   * **His turns cannot be removed.** They are the record of what was said to you, and
   * a conversation where either side can be edited is not a record of anything.
   */
  | { type: 'turn_remove'; at: number }
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

/**
 * An answer settles the oldest question still waiting for one.
 *
 * The **oldest**, not the newest: two questions in a row and one reply means the first
 * has been answered and the second is still owed something. Guessing the other way
 * around would mark the wrong turn done and leave a settled one looking abandoned.
 *
 * Only `awaiting` turns are eligible. A turn that never left the phone is `failed` and
 * an unrelated answer does not redeem it, which is the distinction that makes the
 * state worth keeping at all.
 */
/**
 * What makes two chat entries the same event rather than two similar ones.
 *
 * Same sender, same words, same millisecond. Used by `hydrate` when a restored log meets
 * a live one, and by the `status` append when a pushed reply comes back through the tray
 * sweep carrying its original timestamp — see the test file for the log this was read off.
 *
 * The text is part of the key because two different turns from the same side can land in
 * one millisecond, and on `(from, at)` alone the restored one was thrown away. The `at` is
 * part of it because the same sentence said again later is a second thing that was said.
 */
const sameTurn = (c: ChatEntry) => `${c.from}@${c.at}@${c.text}`;

const settle = (chat: ChatEntry[]): ChatEntry[] => {
  const i = chat.findIndex((c) => c.from === 'user' && c.state === 'awaiting');
  return i < 0 ? chat : chat.map((c, n) => (n === i ? { ...c, state: 'answered' as const } : c));
};

/**
 * Merge what a frame actually said into a parked action, and nothing else.
 *
 * The patch is partial on purpose. `agent_confirm` carries only an action — the
 * goal, the detail and the risk are not on that frame — and this used to take a
 * whole `ParkedAction` with those three filled in as empty strings, then spread
 * it over the existing entry. Park-then-ask is the ordinary agent flow, so a
 * parked action that had arrived with a full description was blanked at the exact
 * moment the user was asked to approve it: a decision with nothing to decide on.
 */
const upsertParked = (
  parked: ParkedAction[],
  next: Partial<ParkedAction> & { id: string; at: number }
): ParkedAction[] => {
  const i = parked.findIndex((p) => p.id === next.id);
  if (i === -1) return [...parked, { goal: '', action: '', detail: '', risk: '', resolving: false, ...next }];
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
       * And the same event arriving a second time is not a second event.
       *
       * A reply can be delivered twice — once pushed, once down a socket that reopened
       * underneath it — and the tray sweep re-enters it with `at: reply.at`, its original
       * arrival time. By then other turns have landed, so `repeated` above cannot see it:
       * the copy is not adjacent to its original. It was appended last while describing
       * something that happened earlier, which put a stale stamp at the foot of the log
       * and made the order a lie.
       *
       * Identity rather than adjacency, so the behaviour above is untouched: a genuine
       * second occurrence carries its own timestamp and still appends.
       */
      const alreadyLogged = state.chat.some(
        (c) => sameTurn(c) === sameTurn({ from: 'jarvis', text: frame.message, at })
      );
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
          frame.message && !repeated && !alreadyLogged && !linkNotice
            ? cap([...settle(state.chat), { from: 'jarvis' as const, text: frame.message, at }], CHAT_CAP)
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
      // only what this frame carries: an id, an action, and when it arrived. A
      // description already gathered from `agent_parked` survives
      return { ...state, parked: upsertParked(state.parked, { id: frame.id, action: frame.action, at }) };
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
    case 'intruder_resolved': {
      /**
       * A resolution for some other alert must not clear the live one — and it
       * must not speak for it either.
       *
       * The `intruder` field was guarded and the announcement was not, so a late
       * resolution for an older id left the countdown correctly on screen and
       * still wrote "Desk locked" into the chat and the timeline. The log then
       * contradicted the screen, on the one subject where that cannot be allowed.
       */
      const stale = state.intruder !== null && state.intruder.id !== frame.id;
      if (stale) return state;
      return {
        ...state,
        intruder: null,
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
}

export function hudReducer(state: HudState, action: HudAction): HudState {
  switch (action.type) {
    case 'frame':
      return { ...applyFrame(state, action.frame, action.at), lastFrameAt: action.at };
    case 'local_command':
      return {
        ...state,
        chat: cap(
          [
            ...state.chat,
            {
              from: 'user' as const,
              text: action.text,
              at: action.at,
              // nothing is known about delivery yet, and saying so is the point
              state: 'sending' as const,
              // spread rather than `image: action.image`, so a typed command's
              // entry has no such key at all — see the note on `ChatEntry.image`
              ...(action.image ? { image: action.image } : {}),
            },
          ],
          CHAT_CAP
        ),
      };
    /**
     * The result of trying to carry one turn, matched by its timestamp.
     *
     * A mark for a turn no longer in the log is dropped rather than appended: the log
     * is capped, so a slow result can land after its turn has aged out, and inventing
     * an entry for it would put the same message on screen twice.
     *
     * Only a `sending` turn is moved, so a late result cannot drag an already-answered
     * turn backwards into waiting.
     */
    case 'turn_sent':
    case 'turn_failed': {
      const settled = action.type === 'turn_sent' ? ('awaiting' as const) : ('failed' as const);
      return {
        ...state,
        chat: state.chat.map((c) =>
          c.from === 'user' && c.at === action.at && c.state === 'sending' ? { ...c, state: settled } : c
        ),
      };
    }
    /**
     * A retry replaces the attempt that failed rather than joining it.
     *
     * Reported from the device: SEND AGAIN left the red turn on screen and put the new
     * one under it, so the chat showed one sentence twice. A retry is the same message
     * having another go.
     */
    case 'turn_drop':
      return {
        ...state,
        chat: state.chat.filter((c) => !(c.from === 'user' && c.at === action.at && c.state === 'failed')),
      };
    case 'turn_remove':
      return {
        ...state,
        chat: state.chat.filter((c) => !(c.from === 'user' && c.at === action.at)),
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
      // De-duplicated on `sameTurn`: a relaunch that restores a log and then receives
      // the same greeting again should not show it twice. The same key gates the
      // `status` append, so the two paths cannot disagree about what one event is.
      //
      // The set grows as it goes, so the restored log is also de-duplicated against
      // ITSELF. It has to be: logs written while the pushed-reply duplicate was live
      // carry both copies, and a fix that leaves them on screen reads exactly like a fix
      // that did not work.
      const seen = new Set(state.chat.map(sameTurn));
      const restored = action.chat.filter((c) => {
        const k = sameTurn(c);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return { ...state, chat: cap([...restored, ...state.chat], CHAT_CAP) };
    }
    case 'reset':
      return initialHudState;
  }
}
