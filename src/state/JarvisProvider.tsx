import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { hudReducer, initialHudState, HudState } from './hudReducer';
import { demoFrames, demoReply } from './demoFeed';
import { useLink } from '../link/useLink';
import { DEFAULT_ENDPOINTS } from '../link/config';
import type { LinkMode, LinkStatus } from '../link/config';
import { createApi } from '../api/client';

export type JarvisContextValue = {
  /** everything the backend has told us */
  hud: HudState;
  mode: LinkMode;
  linkStatus: LinkStatus;
  lastError: string | null;
  connected: boolean;
  /** true while a probe/handshake is in flight */
  connecting: boolean;
  /** re-probe LAN then cloud and reconnect */
  connect: () => void;
  /** send a text command; falls back to REST when the socket is not open */
  sendCommand: (text: string) => Promise<void>;
  /** allow or deny a parked agent action */
  decide: (id: string, approved: boolean) => Promise<void>;
  /**
   * Answer the desk watch: true if the face at the desk was yours. Denying, or
   * never answering, leaves the desk to lock itself — the countdown is the
   * desk's, not this phone's.
   */
  answerWatch: (id: string, itWasMe: boolean) => Promise<void>;
  /** the phone's copy of the countdown ran out with no answer */
  expireWatch: (id: string) => void;
  /**
   * Absolute URL for a path the desk sent — a mugshot. Null when there is no
   * path, or when nothing is linked to fetch it from.
   */
  deskAsset: (path: string | null) => string | null;
  /** locally kept command history, newest first */
  recent: string[];
  clearRecent: () => void;
  /** stand-in desk, for showing the app with no machine to talk to */
  demo: boolean;
  setDemo: (on: boolean) => void;
  /** true when the link being reported is the stand-in, not a machine */
  simulated: boolean;
};

/** how often the stand-in desk speaks */
const DEMO_TICK_MS = 2000;

const JarvisContext = createContext<JarvisContextValue | null>(null);

const RECENT_CAP = 12;

/**
 * Owns the one reducer and the one transport for the whole app.
 *
 * The design put this in a single HUD screen. With four tabs, a screen-level
 * owner would mean four sockets and four reducers, so it is hoisted here and
 * every tab reads the same state.
 */
export function JarvisProvider({ children }: PropsWithChildren) {
  const [hud, dispatch] = useReducer(hudReducer, initialHudState);
  const [recent, setRecent] = useState<string[]>([]);
  // on by default: a build handed to someone with no desk on the network would
  // otherwise open on an empty HUD reporting failure
  const [demo, setDemo] = useState(true);

  const link = useLink({
    onFrame: (frame, at) => dispatch({ type: 'frame', frame, at }),
  });

  const connected = link.status === 'open';
  const tick = useRef(0);

  /**
   * The stand-in desk also stands in for the link.
   *
   * Data alone was not enough for a prototype: every screen still read
   * Disconnected in red while telemetry moved behind it, which is a
   * contradiction a demo cannot explain away. So demo mode runs a handshake —
   * probing, then linked — and `connect()` re-runs it, so the CONNECT button
   * and pull-to-refresh do something.
   *
   * It is never silent about this: `simulated` is true whenever the link the
   * app reports is the stand-in rather than a machine, and the Connection
   * screen says so on its face.
   */
  const [demoPhase, setDemoPhase] = useState<'probing' | 'open'>('probing');

  useEffect(() => {
    if (!demo || connected) return;
    setDemoPhase('probing');
    const timer = setTimeout(() => setDemoPhase('open'), 1400);
    return () => clearTimeout(timer);
  }, [demo, connected]);

  const simulated = demo && !connected;
  const shownConnected = connected || (simulated && demoPhase === 'open');
  const shownConnecting = link.status === 'probing' || link.status === 'connecting' || (simulated && demoPhase === 'probing');

  useEffect(() => {
    // a real desk always wins; the stand-in only speaks when nothing else does
    if (!demo || connected) return;
    const timer = setInterval(() => {
      const at = Date.now();
      for (const frame of demoFrames(tick.current)) dispatch({ type: 'frame', frame, at });
      tick.current += 1;
    }, DEMO_TICK_MS);
    return () => clearInterval(timer);
  }, [demo, connected]);

  const base = useMemo(
    () =>
      link.mode === 'cloud' && DEFAULT_ENDPOINTS.cloudBase ? DEFAULT_ENDPOINTS.cloudBase : DEFAULT_ENDPOINTS.deskBase,
    [link.mode]
  );

  const api = useMemo(() => createApi({ baseUrl: base, token: null }), [base]);

  const deskAsset = useCallback(
    (path: string | null) => {
      if (!path) return null;
      // an absolute url from the desk is taken as given; a bare path is resolved
      // against whichever base the link is currently using
      if (/^https?:\/\//i.test(path)) return path;
      return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
    },
    [base]
  );

  const sendCommand = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      dispatch({ type: 'local_command', text: trimmed, at: Date.now() });
      setRecent((r) => [trimmed, ...r.filter((c) => c !== trimmed)].slice(0, RECENT_CAP));
      // the socket is the fast path; REST is what works when it is not open
      if (link.send(trimmed)) return;
      if (demo && !connected) {
        dispatch({ type: 'frame', frame: demoReply(trimmed), at: Date.now() });
        return;
      }
      await api.backdoor(trimmed);
    },
    [api, link, demo, connected]
  );

  const decide = useCallback(
    async (id: string, approved: boolean) => {
      dispatch({ type: 'resolving', id });
      try {
        // the stand-in desk has no /confirm to call; it just agrees
        if (simulated) return;
        await api.confirm(id, approved);
      } finally {
        // the server echoes an agent_confirm too; dropping it locally keeps the
        // card from sitting there if that echo never arrives
        dispatch({ type: 'resolved_local', id });
      }
    },
    [api]
  );

  const answerWatch = useCallback(
    async (id: string, itWasMe: boolean) => {
      dispatch({ type: 'intruder_resolving', id });
      try {
        // the stand-in desk has nothing to lock, so it simply agrees
        if (simulated) {
          dispatch({
            type: 'frame',
            frame: { kind: 'intruder_resolved', id, outcome: itWasMe ? 'approved' : 'locked' },
            at: Date.now(),
          });
          return;
        }
        await api.answerWatch(id, itWasMe);
      } catch {
        // The desk locks on silence, so a failed answer is not a failed
        // outcome — it means the safe thing happens instead of the convenient
        // one. Close the alert either way rather than leaving a live countdown
        // the user has already answered.
        dispatch({ type: 'intruder_expired', id, at: Date.now() });
      }
    },
    [api, simulated]
  );

  const expireWatch = useCallback((id: string) => {
    dispatch({ type: 'intruder_expired', id, at: Date.now() });
  }, []);

  const connect = useCallback(() => {
    // in demo the handshake is the thing being simulated, so re-run it
    if (simulated) setDemoPhase('probing');
    link.reprobe();
  }, [simulated, link]);

  const value = useMemo<JarvisContextValue>(
    () => ({
      hud,
      mode: simulated ? 'lan' : link.mode,
      linkStatus: simulated ? (shownConnected ? 'open' : 'probing') : link.status,
      lastError: simulated ? null : link.lastError,
      connected: shownConnected,
      connecting: shownConnecting,
      connect,
      sendCommand,
      decide,
      answerWatch,
      expireWatch,
      deskAsset,
      recent,
      clearRecent: () => setRecent([]),
      demo,
      setDemo,
      simulated,
    }),
    [
      hud,
      link.mode,
      link.status,
      link.lastError,
      shownConnected,
      shownConnecting,
      simulated,
      connect,
      sendCommand,
      decide,
      answerWatch,
      expireWatch,
      deskAsset,
      recent,
      demo,
    ]
  );

  return <JarvisContext.Provider value={value}>{children}</JarvisContext.Provider>;
}

export function useJarvis(): JarvisContextValue {
  const ctx = useContext(JarvisContext);
  if (!ctx) throw new Error('useJarvis must be used inside <JarvisProvider>');
  return ctx;
}
