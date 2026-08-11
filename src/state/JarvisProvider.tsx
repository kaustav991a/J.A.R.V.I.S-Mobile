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
  /** locally kept command history, newest first */
  recent: string[];
  clearRecent: () => void;
  /** stand-in desk, for showing the app with no machine to talk to */
  demo: boolean;
  setDemo: (on: boolean) => void;
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

  const api = useMemo(() => {
    const base = link.mode === 'cloud' && DEFAULT_ENDPOINTS.cloudBase ? DEFAULT_ENDPOINTS.cloudBase : DEFAULT_ENDPOINTS.deskBase;
    return createApi({ baseUrl: base, token: null });
  }, [link.mode]);

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
        await api.confirm(id, approved);
      } finally {
        // the server echoes an agent_confirm too; dropping it locally keeps the
        // card from sitting there if that echo never arrives
        dispatch({ type: 'resolved_local', id });
      }
    },
    [api]
  );

  const value = useMemo<JarvisContextValue>(
    () => ({
      hud,
      mode: link.mode,
      linkStatus: link.status,
      lastError: link.lastError,
      connected,
      connecting: link.status === 'probing' || link.status === 'connecting',
      connect: link.reprobe,
      sendCommand,
      decide,
      recent,
      clearRecent: () => setRecent([]),
      demo,
      setDemo,
    }),
    [hud, link.mode, link.status, link.lastError, connected, link.reprobe, sendCommand, decide, recent, demo]
  );

  return <JarvisContext.Provider value={value}>{children}</JarvisContext.Provider>;
}

export function useJarvis(): JarvisContextValue {
  const ctx = useContext(JarvisContext);
  if (!ctx) throw new Error('useJarvis must be used inside <JarvisProvider>');
  return ctx;
}
