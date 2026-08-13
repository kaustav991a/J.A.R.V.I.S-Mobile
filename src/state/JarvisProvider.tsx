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
import { Platform } from 'react-native';
import { hudReducer, initialHudState, HudState } from './hudReducer';
import { clearChat, loadChat, saveChat } from './chatStore';
import { demoFrames, demoReply } from './demoFeed';
import { useLink } from '../link/useLink';
import {
  DEFAULT_ENDPOINTS,
  clearToken,
  loadEndpoints,
  loadToken,
  normaliseBase,
  saveCloudBase,
  saveDeskBase,
  saveToken,
} from '../link/config';
import type { Endpoints, LinkMode, LinkStatus } from '../link/config';
import { createApi } from '../api/client';
import {
  WATCH_CATEGORY,
  WATCH_CHANNEL,
  alertFromLaunch,
  dismiss,
  onAlertTapped,
  postNow,
  registerForPush,
} from '../lib/notify';
import { haptic } from '../lib/haptics';
import {
  askForLocation,
  currentFix,
  forgetTrail,
  loadShareLocation,
  loadTrail,
  rememberPlace,
  saveShareLocation,
  weatherFor,
} from '../lib/place';
import type { TrailStep } from '../lib/place';
import { loadKnown } from '../lib/knownPlaces';
import type { KnownPlace } from '../lib/knownPlaces';
import { COLOR } from '../theme/tokens';

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
  /** switch the link off by hand; nothing automatic brings it back */
  disconnect: () => void;
  /** send a text command; falls back to REST when the socket is not open */
  sendCommand: (text: string) => Promise<void>;
  /** send a recorded clip; the far end transcribes it and answers */
  sendVoice: (clip: { base64: string; format: string }) => Promise<boolean>;
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
  /** replies since the chat was last opened */
  unread: number;
  /** the Chat screen came into focus: everything up to now has been seen */
  markChatRead: () => void;
  /** the Chat screen is (or is no longer) on screen — suppresses reply notifications */
  setChatFocused: (focused: boolean) => void;
  /** forget the whole conversation, on disk as well as in memory */
  forgetChat: () => void;
  /** the addresses in use, and whether a pairing token is held */
  pairing: { deskBase: string; cloudBase: string | null; usingDefault: boolean; hasToken: boolean };
  /**
   * Point the phone at a desk, a cloud gateway, or both, and pair it. Addresses
   * are normalised and an unusable one is rejected — the return says which. Pass
   * null for any of them to forget it. Re-dials on success.
   */
  pair: (next: { base?: string | null; cloud?: string | null; token?: string | null }) => Promise<boolean>;
  /**
   * Whether a question carries where it was asked from, and the recent trail.
   * Turning it on asks for the permission; turning it off forgets the trail.
   * Returns false when the permission was refused.
   */
  shareLocation: boolean;
  setShareLocation: (on: boolean) => Promise<boolean>;
  /** where he is, for the line at the top of Home. Null when sharing is off. */
  place: string | null;
  /** take a fresh fix — called when Home comes into focus */
  refreshPlace: () => Promise<void>;
  /** stand-in desk, for showing the app with no machine to talk to */
  demo: boolean;
  setDemo: (on: boolean) => void;
  /** true when the link being reported is the stand-in, not a machine */
  simulated: boolean;
};

/** how often the stand-in desk speaks */
const DEMO_TICK_MS = 2000;

/**
 * How long the simulated handshake takes.
 *
 * Long enough to read as a real connection being made rather than a button that
 * just changes colour — an instant "Connected" looks like a lie.
 */
const DEMO_HANDSHAKE_MS = 1600;

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

  /**
   * Whether a question carries where it was asked from.
   *
   * Off until switched on, and persisted — sharing a location is a decision, not a
   * default, and one made once should not have to be made again on every launch.
   * The switch covers the trail too: they are the same disclosure, and two
   * switches for one decision is how people end up sharing more than they meant.
   */
  const [shareLocation, setShareLocationState] = useState(false);
  useEffect(() => {
    void loadShareLocation().then(setShareLocationState);
  }, []);

  /**
   * The place name to show at the top of Home.
   *
   * Held here rather than fetched by the screen so the fix is taken once and every
   * surface reads the same one — and so it survives a tab change without spinning
   * the GPS again. Refreshed when Home comes into focus, which is the only moment
   * the answer is being looked at.
   */
  const [place, setPlace] = useState<string | null>(null);

  const refreshPlace = useCallback(async () => {
    if (!shareLocation) {
      setPlace(null);
      return;
    }
    const fix = await currentFix();
    if (!fix) return;
    setPlace(fix.place || `${fix.lat.toFixed(3)}, ${fix.lon.toFixed(3)}`);
    void rememberPlace(fix);
  }, [shareLocation]);

  const setShareLocation = useCallback(async (on: boolean) => {
    // asked for at the moment it is switched on, so the dialog has a reason the
    // user can see, rather than arriving unexplained at startup
    if (on && !(await askForLocation())) return false;
    setShareLocationState(on);
    await saveShareLocation(on);
    if (!on) {
      setPlace(null);
      await forgetTrail();
    }
    return true;
  }, []);

  /**
   * The desk address and token, owned here rather than read inside the link.
   *
   * `undefined` means "not loaded yet, use whatever is stored" — the same
   * behaviour the app had before any screen could set these. Once loaded they are
   * held here, so re-pairing re-dials without remounting anything.
   */
  const [endpoints, setEndpoints] = useState<Endpoints>(DEFAULT_ENDPOINTS);
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadEndpoints(), loadToken()]).then(([e, t]) => {
      if (!alive) return;
      setEndpoints(e);
      setToken(t);
    });
    return () => {
      alive = false;
    };
  }, []);

  const link = useLink({
    endpoints,
    token,
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
  /**
   * Bumped by `connect()` to re-run the handshake.
   *
   * Without it the effect below only ever ran on mount: `connect()` set the
   * phase back to `probing`, but `demo` and `connected` were both unchanged, so
   * no new timer was scheduled and the screen sat on "Connecting" forever. Every
   * press after the first was a dead end.
   */
  const [probeNonce, setProbeNonce] = useState(0);

  useEffect(() => {
    if (!demo || connected) return;
    setDemoPhase('probing');
    const timer = setTimeout(() => setDemoPhase('open'), DEMO_HANDSHAKE_MS);
    return () => clearTimeout(timer);
  }, [demo, connected, probeNonce]);

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

  // the live endpoints, not the build defaults: after re-pairing, REST has to
  // follow the socket to the new desk rather than staying on the old address
  const base = useMemo(
    () => (link.mode === 'cloud' && endpoints.cloudBase ? endpoints.cloudBase : endpoints.deskBase),
    [link.mode, endpoints]
  );

  // the token goes on REST too. The socket carries it as a query parameter
  // because React Native cannot set handshake headers; REST can use the header,
  // and both routes the desk gates are reached this way.
  const api = useMemo(() => createApi({ baseUrl: base, token: token ?? null }), [base, token]);

  const pairing = useMemo(
    () => ({
      deskBase: endpoints.deskBase,
      cloudBase: endpoints.cloudBase,
      usingDefault: endpoints.deskBase === DEFAULT_ENDPOINTS.deskBase,
      // whether one is held, never the value — nothing needs to read the secret
      // back out to render, so it is not put on the context
      hasToken: Boolean(token),
    }),
    [endpoints, token]
  );

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

      /**
       * A question asked from a known place is answered from measurements.
       *
       * He asked about the weather where he was and was told there was no rain
       * while it was raining. The gateway can fetch the real conditions for a
       * coordinate, so when sharing is on the coordinate goes with the question —
       * and with it the recent trail, so "where was I this morning" has an answer.
       *
       * Off unless switched on, taken one fix at a time, and never in the
       * background. Failure is silent by design: no location simply means the
       * question is asked the way it always was.
       */
      if (shareLocation) {
        const fix = await currentFix();
        if (fix) {
          void rememberPlace(fix);
          // Fetched here, not on the gateway. Open-Meteo rate-limits per IP and
          // Render's outbound address is shared, so the gateway was answered
          // `429 Too Many Requests` and J.A.R.V.I.S. had to say he could not check.
          // A phone asks from its own address, a few times a day.
          const [trail, weather, known] = await Promise.all([
            loadTrail(),
            weatherFor(fix.lat, fix.lon),
            loadKnown(),
          ]);
          const envelope = JSON.stringify({
            type: 'ask',
            text: trimmed,
            where: {
              lat: fix.lat,
              lon: fix.lon,
              place: fix.place,
              weather,
              trail: trail.map((s: TrailStep) => ({ place: s.place, when: s.when })),
              // only this phone knows what "the office" means, so the meaning
              // travels with the question rather than being stored on the gateway
              known: known.map((k: KnownPlace) => ({ label: k.label, lat: k.lat, lon: k.lon })),
            },
          });
          if (link.send(envelope)) return;
        }
      }

      // the socket is the fast path; REST is what works when it is not open
      if (link.send(trimmed)) return;
      if (demo && !connected) {
        dispatch({ type: 'frame', frame: demoReply(trimmed), at: Date.now() });
        return;
      }
      await api.backdoor(trimmed);
    },
    [api, link, demo, connected, shareLocation]
  );

  /**
   * Send a recorded clip for the far end to transcribe and answer.
   *
   * Nothing is written to the chat here. The transcript comes back as its own
   * frame and is logged as *him* speaking — writing a local "…" turn as well
   * would put the same utterance in the log twice, once as a placeholder that
   * never resolves.
   */
  const sendVoice = useCallback(
    async (clip: { base64: string; format: string }) => {
      const envelope = JSON.stringify({ type: 'voice', format: clip.format, audio: clip.base64 });
      // the socket is the only route: there is no REST endpoint that transcribes,
      // and a clip queued for a dead link would arrive answering nothing
      return link.send(envelope);
    },
    [link]
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

  /**
   * Raise a system notification when the desk watch fires.
   *
   * The socket only reaches a foregrounded app, so without this an alert that
   * arrives while the phone is in a pocket is never seen — and the desk locks on
   * silence 30 seconds later. A local notification needs no push server and no
   * Firebase config, so it works in every build.
   *
   * Dismissed as soon as the alert resolves, so a notification for a closed
   * window cannot be tapped.
   */
  const watchNote = useRef<string | null>(null);
  const alert = hud.intruder;
  useEffect(() => {
    if (!alert) {
      void dismiss(watchNote.current);
      watchNote.current = null;
      return;
    }
    let alive = true;
    void postNow({
      title: 'Someone at the desk',
      body: `Was this you? The desk locks itself in ${Math.max(1, Math.round((alert.deadline - Date.now()) / 1000))}s.`,
      channel: WATCH_CHANNEL,
      category: WATCH_CATEGORY,
      // ongoing, so Android cannot fold it into an auto-group and a stray swipe
      // cannot clear the one notification with a countdown behind it
      sticky: true,
      // red, not the app's blue: this is the only notification here that is not
      // information but a decision with a clock on it
      color: COLOR.red,
      data: {
        kind: 'intruder',
        id: alert.id,
        // the same shape the gateway's push carries, so a tap rebuilds the alert
        // by the one path rather than two
        expires_at_ms: alert.deadline,
        image: alert.image,
        user: alert.user,
        trigger: alert.trigger,
      },
    }).then((id) => {
      if (alive) watchNote.current = id;
      else void dismiss(id);
    });
    return () => {
      alive = false;
    };
  }, [alert?.id, alert]);

  /**
   * The conversation, read at launch and written as it changes.
   *
   * Restored before anything is sent so the log the user left is the log they come
   * back to. Writing is debounced: a reply arrives as several frames in a row
   * (`thinking`, `speaking`, `online`) and each one would otherwise be a disk
   * write of the entire log.
   */
  useEffect(() => {
    let alive = true;
    void loadChat().then((chat) => {
      if (alive && chat.length) dispatch({ type: 'hydrate', chat });
    });
    return () => {
      alive = false;
    };
  }, []);

  const chat = hud.chat;
  useEffect(() => {
    const timer = setTimeout(() => void saveChat(chat), 400);
    return () => clearTimeout(timer);
  }, [chat]);

  /**
   * Hand the gateway this install's push address, once, per cloud link.
   *
   * Only over cloud: the desk serves no such route, and only the gateway knows
   * when the desk attaches. Registration is deliberately silent — a gateway that
   * does not serve the route yet answers 404, which is not something to put in
   * front of the user, and the next connect tries again.
   */
  useEffect(() => {
    if (simulated || link.mode !== 'cloud' || link.status !== 'open') return;
    let alive = true;
    void registerForPush().then((push) => {
      if (!alive || !push) return;
      // Silent on failure, and unguarded on purpose. Registering is idempotent
      // server-side — it keys on the address — so re-sending costs one small POST
      // per connect and buys the only recovery there is from the gateway losing
      // its list. It does lose it: Render's free disk is wiped on every redeploy,
      // and a "register once per address" guard left the phone unreachable by push
      // until the app was restarted. It also went stale on a rotated token, since
      // the address had not changed but the credential had.
      void api.registerPush(push, Platform.OS).catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [api, link.mode, link.status, simulated]);

  /**
   * A watch alert tapped in the notification shade raises the answer screen.
   *
   * A sleeping phone holds no socket, so it never received the frame — the push
   * carried the alert instead, and this puts it back into the reducer as though
   * the socket had delivered it. Both routes matter: `alertFromLaunch` covers a
   * notification tapped while the app was dead, which no listener ever sees, and
   * the listener covers one tapped while it was merely in the background.
   *
   * `alertFromData` refuses an alert whose window has already closed, so a
   * notification found sitting in the shade an hour later cannot raise a live
   * countdown against a desk that locked itself long ago.
   */
  useEffect(() => {
    const raise = (alert: { id: string; expiresIn: number; image: string | null; user: string | null; trigger: string }) =>
      dispatch({
        type: 'frame',
        frame: {
          kind: 'intruder',
          id: alert.id,
          expiresIn: alert.expiresIn,
          image: alert.image,
          user: alert.user,
          trigger: alert.trigger,
        },
        at: Date.now(),
      });

    let alive = true;
    void alertFromLaunch().then((alert) => {
      if (alive && alert) raise(alert);
    });
    const off = onAlertTapped(raise);
    return () => {
      alive = false;
      off();
    };
  }, []);

  /**
   * Replies you have not seen, and a notification for the ones that arrive while
   * you are not looking.
   *
   * Sending from Home and walking away meant there was no way to know an answer
   * had come back — the reply landed in a tab you were not on, silently. `unread`
   * counts J.A.R.V.I.S. turns since the chat was last opened; `markChatRead` is
   * called by the Chat screen when it comes into focus.
   *
   * The notification is deliberately not posted while the chat is on screen: you
   * are watching the answer arrive, and buzzing about it is noise. Nor for a
   * restored turn — `hydrate` brings back turns that were already seen, and
   * launching the app must not replay yesterday's notifications.
   */
  const [readAt, setReadAt] = useState(() => Date.now());
  const markChatRead = useCallback(() => setReadAt(Date.now()), []);
  const unread = useMemo(
    () => hud.chat.filter((c) => c.from === 'jarvis' && c.at > readAt).length,
    [hud.chat, readAt]
  );

  const chatFocused = useRef(false);
  const setChatFocused = useCallback((focused: boolean) => {
    chatFocused.current = focused;
  }, []);

  const notifiedFor = useRef<number>(0);
  useEffect(() => {
    const newest = hud.chat[hud.chat.length - 1];
    if (!newest || newest.from !== 'jarvis') return;
    if (newest.at <= notifiedFor.current) return;
    const first = notifiedFor.current === 0;
    notifiedFor.current = newest.at;
    // the first pass is whatever was already on screen or restored from disk, not
    // news; and a reply being watched arrive needs no notification
    if (first || chatFocused.current || simulated) return;
    void postNow({
      title: 'J.A.R.V.I.S. replied',
      body: newest.text.length > 140 ? `${newest.text.slice(0, 139)}…` : newest.text,
      data: { kind: 'reply' },
    });
  }, [hud.chat, simulated]);

  /**
   * The desk arriving is worth interrupting for; the desk leaving is not.
   *
   * A cloud session answers out of the light brain until the desk attaches to the
   * gateway, at which point the same socket reaches the real machine — PC control
   * and all. That is a change in what the app can do, so it earns a notification.
   * The reverse is a quiet downgrade: the pill says so, and buzzing a pocket to
   * report that a machine went to sleep is noise.
   *
   * Guarded on the previous value rather than fired on every `true`, because the
   * gateway restates desk state on every reconnect — and a re-dial is not news.
   */
  const wasLinked = useRef<boolean | null>(null);
  const deskLinked = hud.deskLinked;
  useEffect(() => {
    const arrived = deskLinked === true && wasLinked.current !== true;
    wasLinked.current = deskLinked;
    if (!arrived || simulated) return;
    haptic.good();
    void postNow({
      title: 'J.A.R.V.I.S. is on full power',
      body: 'The desk is online. PC control, files and terminal are available again.',
      data: { kind: 'desk_link' },
    });
  }, [deskLinked, simulated]);

  const pair = useCallback(async (next: { base?: string | null; cloud?: string | null; token?: string | null }) => {
    if (next.base !== undefined) {
      // null forgets the address; anything unusable is refused rather than stored,
      // because a stored address that cannot be dialled looks like a dead desk
      const base = next.base === null ? null : normaliseBase(next.base);
      if (next.base !== null && base === null) return false;
      await saveDeskBase(base);
      // merged into the CURRENT endpoints, not into the build defaults: rebuilding
      // from DEFAULT_ENDPOINTS here silently threw away a gateway the user had set
      setEndpoints((e) => ({ ...e, deskBase: base ?? DEFAULT_ENDPOINTS.deskBase }));
    }
    if (next.cloud !== undefined) {
      const cloud = next.cloud === null ? null : normaliseBase(next.cloud);
      if (next.cloud !== null && cloud === null) return false;
      await saveCloudBase(cloud);
      setEndpoints((e) => ({ ...e, cloudBase: cloud ?? DEFAULT_ENDPOINTS.cloudBase }));
    }
    if (next.token !== undefined) {
      const trimmed = next.token === null ? null : next.token.trim();
      if (trimmed) await saveToken(trimmed);
      else await clearToken();
      setToken(trimmed || null);
    }
    return true;
  }, []);

  const connect = useCallback(() => {
    // in demo the handshake is the thing being simulated, so re-run it — the
    // nonce is what actually restarts it, since setting the phase alone changes
    // none of the effect's other dependencies
    if (simulated) setProbeNonce((n) => n + 1);
    link.reprobe();
  }, [simulated, link]);

  /**
   * Switch the link off deliberately, and turn the stand-in off with it.
   *
   * Demo mode is on by default, and `simulated` is `demo && !connected` — so
   * disconnecting would otherwise hand the screens a simulated desk the moment
   * the real one went away, which reads as "still connected" and makes the button
   * look broken. Asking for no link means no link, of either kind.
   */
  const disconnect = useCallback(() => {
    setDemo(false);
    link.disconnect();
  }, [link]);

  const value = useMemo<JarvisContextValue>(
    () => ({
      hud,
      mode: simulated ? 'lan' : link.mode,
      linkStatus: simulated ? (shownConnected ? 'open' : 'probing') : link.status,
      lastError: simulated ? null : link.lastError,
      connected: shownConnected,
      connecting: shownConnecting,
      connect,
      disconnect,
      sendCommand,
      sendVoice,
      decide,
      answerWatch,
      expireWatch,
      deskAsset,
      pairing,
      pair,
      recent,
      clearRecent: () => setRecent([]),
      unread,
      markChatRead,
      setChatFocused,
      forgetChat: () => {
        void clearChat();
        dispatch({ type: 'reset' });
      },
      shareLocation,
      setShareLocation,
      place,
      refreshPlace,
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
      disconnect,
      sendCommand,
      decide,
      answerWatch,
      expireWatch,
      deskAsset,
      pairing,
      pair,
      recent,
      shareLocation,
      setShareLocation,
      place,
      refreshPlace,
      unread,
      markChatRead,
      setChatFocused,
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
