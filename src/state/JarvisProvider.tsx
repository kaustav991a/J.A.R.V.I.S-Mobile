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
import { AppState, Platform } from 'react-native';
import { hudReducer, initialHudState, HudState } from './hudReducer';
import { clearChat, loadChat, saveChat } from './chatStore';
import { loadRead, saveRead } from './readStore';
import { live } from './live';
import { countable, itemId, timeline } from './activity';
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
import type { Api } from '../api/client';
import {
  GENERAL_CHANNEL,
  WATCH_CATEGORY,
  WATCH_CHANNEL,
  alertFromLaunch,
  dismiss,
  onAlertTapped,
  postNow,
  registerForPush,
  shouldNotifyReply,
  onPushReply,
  pendingReplies,
  replyFromLaunch,
} from '../lib/notify';
import type { PushedReply } from '../lib/notify';
import { haptic } from '../lib/haptics';
import {
  FIX_TTL_MS,
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
import { buildAsk } from '../lib/ask';
import type { AskUsage, AskWhere } from '../lib/ask';
import { usageForAsk } from '../lib/journal/rollup';
import { openJournal } from '../lib/journal/store';
import { loadKnown, nameFor } from '../lib/knownPlaces';
import { loadCommute, markCloudArmed } from '../lib/commute';
import { forgetSeen, noteSeen } from '../lib/timeline';
import { capabilityAnswer, isCapabilityQuestion } from '../lib/capabilities';
import { asOpenAppCommand, matchApp } from '../lib/openApp';
import { installed as installedApps, launch as launchApp } from '../../modules/app-launcher';
import { commutePayload } from '../lib/commuteSync';
import type { KnownPlace } from '../lib/knownPlaces';
import { openChat } from '../navigation/RootNavigator';
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
  /** send a photo for the far end to look at; the caption may be empty */
  sendPhoto: (shot: { base64: string; uri: string }, caption: string) => Promise<boolean>;
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
  /**
   * Activity events not yet seen, for the count on the bell. Parked approvals are
   * NOT included — the bell adds those itself, because marking things read must not
   * clear something that still needs a decision.
   */
  alertsUnread: number;
  /** the activity sheet was read: everything currently in it has been seen */
  markAlertsRead: () => void;
  /** one entry was opened, and only that one is read */
  markRead: (id: string) => void;
  /** which entries have been seen, so the panel can mark the rest */
  readIds: ReadonlySet<string>;
  /** withdraw a failed turn, because it is being sent again rather than repeated */
  dropTurn: (at: number) => void;
  /** remove one of your own turns, because you asked. His are the record and stay */
  removeTurn: (at: number) => void;
  /**
   * Whether the gateway holds a push address for this phone.
   *
   * `unasked` until a cloud connect has happened, which is not the same as refused.
   */
  push: 'registered' | 'no-token' | 'unasked';
  /** the Chat screen came into focus: everything up to now has been seen */
  markChatRead: () => void;
  /**
   * The Chat screen is (or is no longer) on screen, which keeps `unread` honest.
   *
   * It used to suppress reply notifications too, and could not: navigation blur
   * does not fire when the app is backgrounded, so this stayed true for a phone in
   * a pocket. `shouldNotifyReply` asks about the app being on screen instead.
   */
  setChatFocused: (focused: boolean) => void;
  /** forget the whole conversation, on disk as well as in memory */
  forgetChat: () => void;
  /**
   * The REST client, for screens that need a route the socket does not carry.
   *
   * Exposed rather than rebuilt per screen: it holds the pairing token and the
   * cloud address, and a second instance would drift from the live one the moment
   * either changed.
   */
  api: Api;
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
  /**
   * Hand the gateway the commute schedule, so the briefing can be pushed.
   *
   * Called on every cloud connect and after every edit on the Places screen.
   * Idempotent by design — it replaces what the gateway holds — because Render's
   * free disk is wiped on redeploy and a "send it once" guard would leave the
   * gateway briefing on a schedule the phone had already changed.
   */
  syncCommute: () => Promise<void>;
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
  /**
   * The stand-in desk, off by default.
   *
   * It was on, so a build handed to someone with no desk on the network would not
   * open on an empty HUD reporting failure. That reasoning expired the day there
   * was a cloud brain to talk to: invented telemetry and `Acknowledged: …` replies
   * sitting next to real ones are indistinguishable from the assistant making
   * things up, which is the exact complaint this app is trying to answer.
   *
   * An empty panel that says nothing is honest. Turn it back on from Settings when
   * showing the app to someone.
   */
  const [demo, setDemo] = useState(false);

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
    const l = live();
    void loadShareLocation().then(l.only(setShareLocationState));
    return l.end;
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
    /**
     * A named place wins over whatever the geocoder called the neighbourhood.
     *
     * `nameFor` existed for exactly this and was only being used for the context
     * sent with an ask (see `label` below). The state every screen reads went on
     * showing the raw area, so standing in the office produced "Bidhannagar, West
     * Bengal" — three words of administrative geography where the app already knew
     * the answer was "Office".
     *
     * Noticed once the chat began saying this out loud rather than printing it in
     * a corner: a status line can afford to be vague, a sentence cannot.
     */
    const known = nameFor(fix, await loadKnown());
    setPlace(known || fix.place || `${fix.lat.toFixed(3)}, ${fix.lon.toFixed(3)}`);
    void rememberPlace(fix);
    /**
     * And a sighting, for the habit rather than for the trail.
     *
     * **Named places only.** A reverse-geocoded string drifted across four turns for
     * the same desk, which is why `nameFor` exists — and a habit built on drifting
     * labels would count one place as several. `lib/timeline.ts` explains what this
     * can and cannot know: it is *last seen*, not *left*, because a sighting needs
     * the app to be open.
     */
    if (known) void noteSeen(known);
  }, [shareLocation]);

  const setShareLocation = useCallback(async (on: boolean) => {
    // asked for at the moment it is switched on, so the dialog has a reason the
    // user can see, rather than arriving unexplained at startup
    if (on && !(await askForLocation())) return false;
    setShareLocationState(on);
    await saveShareLocation(on);
    if (!on) {
      setPlace(null);
      // both, and for the same reason: turning sharing off is not "stop collecting",
      // it is "you should not still have that"
      await Promise.all([forgetTrail(), forgetSeen()]);
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
    const l = live();
    void Promise.all([loadEndpoints(), loadToken()]).then(
      l.only(([e, t]) => {
        setEndpoints(e);
        setToken(t);
      })
    );
    return l.end;
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
  /**
   * The desk only when the socket actually found a desk. Otherwise the cloud.
   *
   * This asked for `mode === 'cloud'` and fell back to the desk address for
   * every other mode — including `offline` and the moment before a first probe
   * finishes. The stored desk address on this phone is `http://127.0.0.1:8787`,
   * which is the phone itself, so REST posted into nothing.
   *
   * That is what produced "That did not get through, sir" on a message sent
   * while the socket was still coming up: `link.send()` correctly returned
   * false, the REST fallback was correctly reached, and it was aimed at
   * localhost. The one path that exists for exactly this case could not work.
   */
  const base = useMemo(
    () => (link.mode === 'lan' ? endpoints.deskBase : endpoints.cloudBase ?? endpoints.deskBase),
    [link.mode, endpoints]
  );

  // the token goes on REST too. The socket carries it as a query parameter
  // because React Native cannot set handshake headers; REST can use the header,
  // and both routes the desk gates are reached this way.
  // `cloudUrl` is passed separately from `base`: the gateway-only routes must not
  // follow the live link onto the desk, which does not serve them
  const api = useMemo(
    () => createApi({ baseUrl: base, cloudUrl: endpoints.cloudBase, token: token ?? null }),
    [base, endpoints.cloudBase, token]
  );

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
      // one stamp, reused: it is the turn's identity for the rest of this function,
      // and a second `Date.now()` would mark a turn that does not exist
      const sentAt = Date.now();
      dispatch({ type: 'local_command', text: trimmed, at: sentAt });
      setRecent((r) => [trimmed, ...r.filter((c) => c !== trimmed)].slice(0, RECENT_CAP));

      /**
       * "What can you do" is answered here, on the phone, and never sent.
       *
       * A model asked to list its own features always finds one — and a capability
       * offered confidently that does not exist is the most expensive wrong answer
       * this app can give: someone goes looking for it, does not find it, and
       * reports a bug against something that was never built. `lib/capabilities.ts`
       * holds the list in code, so it can only be wrong deliberately.
       *
       * It also answers with the desk asleep, the gateway cold and no network at
       * all, which is when someone is most likely to be asking what this is for —
       * the same reasoning as the opening line in `lib/situation.ts`.
       *
       * After the local echo, so the question is in the log above its answer, and
       * before anything touches the transport. `isCapabilityQuestion` is deliberately
       * narrow; the exclusions are pinned by tests.
       */
      if (isCapabilityQuestion(trimmed)) {
        // carried by the phone itself, and answered in the same breath — so it
        // settles rather than sitting at `sending` forever, which would have it
        // looking like the one class of turn that genuinely cannot be dropped
        dispatch({ type: 'turn_sent', at: sentAt });
        dispatch({
          type: 'frame',
          frame: { kind: 'status', status: 'speaking', message: capabilityAnswer(), user: null },
          at: Date.now(),
        });
        return;
      }

      /**
       * A question asked from a known place is answered from measurements.
       *
       * He asked about the weather where he was and was told there was no rain
       * while it was raining. The gateway can fetch the real conditions for a
       * coordinate, so when sharing is on the coordinate goes with the question —
       * and with it the recent trail, so "where was I this morning" has an answer.
       *
       * Location is off unless switched on, taken one fix at a time, and never in
       * the background. Failure is silent by design.
       *
       * The *envelope*, though, is unconditional. It used to be built only inside
       * this branch, so a question asked with sharing off went as bare text and
       * lost the clock and the named places along with the coordinate — three
       * things dropped to withhold one.
       */
      // only this phone knows what "the office" means, so the meaning travels with
      // the question rather than being stored on the gateway
      const places = await loadKnown();
      const known = places.map((k: KnownPlace) => ({ label: k.label, lat: k.lat, lon: k.lon }));
      let where: AskWhere | null = null;

      if (shareLocation) {
        // a recent fix rather than a new one: the GPS read and the reverse geocode
        // ran before every message left the phone, and that wait reads as the cloud
        // brain being slow. Nobody moves between two turns of a conversation.
        const fix = await currentFix(FIX_TTL_MS);
        if (fix) {
          void rememberPlace(fix);
          // Fetched here, not on the gateway. Open-Meteo rate-limits per IP and
          // Render's outbound address is shared, so the gateway was answered
          // `429 Too Many Requests` and J.A.R.V.I.S. had to say he could not check.
          // A phone asks from its own address, a few times a day.
          const [trail, weather] = await Promise.all([loadTrail(), weatherFor(fix.lat, fix.lon)]);
          where = {
            lat: fix.lat,
            lon: fix.lon,
            place: fix.place,
            // a place he named by standing in it, if this is one of them — the
            // geocoder's answer for the same desk drifted across four turns
            label: nameFor(fix, places),
            weather,
            trail: trail.map((s: TrailStep) => ({ place: s.place, when: s.when })),
          };
        }
      }

      /**
       * How the phone has been used travels with the question, like the clock
       * and the named places already do.
       *
       * A summary, never rows — the journal's raw events stay on the device.
       * It is what turns "am I on my phone too much" from a question he has to
       * answer himself into one J.A.R.V.I.S. can, and it costs a few hundred
       * bytes on a message that already carries a coordinate and a forecast.
       *
       * Its failure is silent by design, exactly as location's is: a journal
       * that cannot be read must never be the reason a message does not go.
       */
      let usage: AskUsage | null = null;
      try {
        usage = await usageForAsk(await openJournal(), Date.now());
      } catch {
        // no journal, no usage block, same question
      }

      /**
       * Every exit from here settles the turn, and that is new as of 2026-08-21.
       *
       * The echo used to be the only record: four different outcomes — carried by the
       * socket, carried by REST, answered by the stand-in, carried by nothing — all
       * left the same entry on screen. So "I sent a message then closed the app and
       * never got a reply" had no evidence behind it either way.
       *
       * `turn_sent` means carried, NOT answered. The wait it starts is the thing
       * worth showing, because that is the state a dropped answer leaves behind.
       */
      /**
       * "Open Swiggy" is done here, by the phone, and never sent.
       *
       * A model cannot launch anything — it can only say that it did, which is the
       * worst outcome available. So the phone recognises the instruction, checks it
       * against what is actually installed, and acts. Nothing is asked of the
       * gateway, which is why it works with the desk asleep and no network.
       *
       * Falls through to the transport whenever the name matches nothing or matches
       * two things equally. `matchApp` declines on a tie rather than guessing, and
       * the model then answers "open the door" as the question it is. Refusing to
       * open something costs a shrug; opening the wrong app takes over the screen.
       */
      const wanted = asOpenAppCommand(trimmed);
      if (wanted) {
        const app = matchApp(wanted, await installedApps());
        if (app) {
          const opened = await launchApp(app.pkg);
          dispatch({ type: 'turn_sent', at: sentAt });
          dispatch({
            type: 'frame',
            frame: {
              kind: 'status',
              status: 'speaking',
              message: opened
                ? `${app.label}, sir.`
                : // flat, and with no remark on it: a line whose job is admitting
                  // something did not happen reads as though it did once wit is added
                  `I could not open ${app.label}, sir.`,
              user: null,
            },
            at: Date.now(),
          });
          return;
        }
      }

      // the socket is the fast path; REST is what works when it is not open
      if (link.send(buildAsk({ text: trimmed, known, where, usage }))) {
        dispatch({ type: 'turn_sent', at: sentAt });
        return;
      }
      if (demo && !connected) {
        dispatch({ type: 'turn_sent', at: sentAt });
        dispatch({ type: 'frame', frame: demoReply(trimmed), at: Date.now() });
        return;
      }
      /**
       * The turn that could not be carried says so, rather than disappearing.
       *
       * Both paths gone — socket shut, gateway unreachable — used to reject out of
       * here into `.catch(() => {})` at all four call sites. The local echo was
       * already in the log by then, so the chat showed the question exactly as it
       * looks while J.A.R.V.I.S. is thinking, and nothing ever arrived. There was
       * no way to tell a lost message from a slow one, which is the single thing
       * this app is most often accused of.
       *
       * Flat, and with no wit in it, for the reason the `unavailable` briefing is:
       * a line whose job is admitting nothing happened reads as though something
       * did once a remark is attached to it.
       */
      try {
        await api.backdoor(trimmed);
        dispatch({ type: 'turn_sent', at: sentAt });
      } catch {
        dispatch({ type: 'turn_failed', at: sentAt });
        dispatch({
          type: 'frame',
          frame: {
            kind: 'status',
            status: 'error',
            message:
              'That did not get through, sir. No link to the desk, and the gateway did not answer — nothing was sent.',
            user: null,
          },
          at: Date.now(),
        });
      }
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
  /**
   * Send down the socket, waiting for it if it is between lives.
   *
   * The camera and the microphone permission sheet are full-screen system
   * activities: the app is backgrounded while they are up, and Android is free to
   * take the WebSocket with it. So a send issued the instant the user comes back
   * lands in the gap between `close` and the re-probe finishing, `send()` returns
   * false, and the app reports no link while the network is perfectly fine.
   *
   * Read through a ref rather than the captured `link`, since the machine is
   * replaced on every re-dial and a closure would keep sending into the old one.
   */
  const linkRef = useRef(link);
  useEffect(() => {
    linkRef.current = link;
  }, [link]);

  const sendWhenOpen = useCallback(async (payload: string, waitMs = 20000): Promise<boolean> => {
    const started = Date.now();
    for (;;) {
      if (linkRef.current.send(payload)) return true;
      if (Date.now() - started > waitMs) return false;
      // the re-probe runs on a 5s tick, so this has to outlast at least two of them
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }, []);

  const sendVoice = useCallback(
    async (clip: { base64: string; format: string }) => {
      const envelope = JSON.stringify({ type: 'voice', format: clip.format, audio: clip.base64 });
      // the socket is the only route: there is no REST endpoint that transcribes
      return sendWhenOpen(envelope);
    },
    [sendWhenOpen]
  );

  /**
   * Send a photo for the far end to look at, with an optional caption.
   *
   * Unlike a voice clip, this *does* write a local turn. A clip comes back as a
   * transcript frame that is logged as him speaking, so writing one here would
   * duplicate it — a photo has no such echo, and a chat that showed nothing until
   * the reply arrived would look like the send had failed.
   *
   * The socket is the only route: `/api/backdoor` takes a command string, and
   * there is no REST endpoint on either end that accepts an image.
   */
  const sendPhoto = useCallback(
    async (shot: { base64: string; uri: string }, caption: string) => {
      const said = caption.trim();
      // The uri travels with it so the bubble can show the picture rather than the
      // word "Photo". It was already in hand — `takeShot` returns both halves and
      // only the base64 was ever used.
      const sentAt = Date.now();
      dispatch({
        type: 'local_command',
        text: said ? `📷 ${said}` : '📷 Photo',
        at: sentAt,
        image: shot.uri,
      });
      // waits for the socket: the camera it just came back from is exactly what
      // takes the socket away
      const carried = await sendWhenOpen(JSON.stringify({ type: 'photo', image: shot.base64, text: said }));
      /**
       * And settle it, which `sendCommand` did from the start and this did not.
       *
       * Caught on the phone within minutes of the marks shipping: a photo sat at
       * `SENDING` twenty minutes after it had plainly arrived and been answered,
       * because nothing here ever moved it off the state `local_command` gives every
       * new turn. Any path that writes a turn owes it a resolution.
       */
      dispatch({ type: carried ? 'turn_sent' : 'turn_failed', at: sentAt });
      return carried;
    },
    [sendWhenOpen]
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
    const l = live();
    void postNow({
      // the one notification in the app with no wit in it, and deliberately so:
      // there is a lock deadline running behind this line, and a dry remark on a
      // security prompt costs the seconds it takes to work out whether it is one
      title: 'Someone is at your desk, sir',
      body: `Was that you? The desk locks itself in ${Math.max(1, Math.round((alert.deadline - Date.now()) / 1000))}s.`,
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
        /**
         * The one notification that must be heard with the app already open.
         *
         * `installHandler` answers `shouldPlaySound: false` for anything that has
         * not opted in, and on Android that flag is the vibration switch as well —
         * so this arrived in complete silence whenever the app happened to be
         * foregrounded. The alert screen takes the display over, which serves a
         * phone being looked at and does nothing whatever for one lying face down
         * on the desk with thirty seconds on the clock.
         */
        alertWhenOpen: true,
      },
    }).then((id) => {
      // `l.alive` rather than `l.only`: a registration that outlived its run must be
      // handed back, not dropped. Left un-dismissed it is a notification for an alert
      // that no longer exists, and the deps here are `[alert?.id, alert]` — so this
      // fires on every alert change, not only on unmount.
      if (l.alive) watchNote.current = id;
      else void dismiss(id);
    });
    return l.end;
  }, [alert?.id, alert]);

  /**
   * The conversation, read at launch and written as it changes.
   *
   * Restored before anything is sent so the log the user left is the log they come
   * back to. Writing is debounced: a reply arrives as several frames in a row
   * (`thinking`, `speaking`, `online`) and each one would otherwise be a disk
   * write of the entire log.
   */
  /**
   * Which timeline entries have been seen. Declared here because `hydrate` below
   * seeds it, and a const cannot be referenced above its own declaration.
   *
   * Union, never replace, and persist whatever comes out. The stored set arrives
   * asynchronously and `hydrate` seeds its own ids, so the two land in an order
   * nothing here controls — replacing would let whichever resolved second erase the
   * other's marks.
   */
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const remember = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setReadIds((prev) => {
      if (ids.every((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      void saveRead([...next]);
      return next;
    });
  }, []);

  useEffect(() => {
    const l = live();
    void loadRead().then(l.only((ids) => setReadIds((prev) => new Set([...prev, ...ids]))));
    return l.end;
  }, []);

  useEffect(() => {
    const l = live();
    void loadChat().then(
      l.only((chat) => {
        if (!chat.length) return;
      dispatch({ type: 'hydrate', chat });
      /**
       * A restored log has already been seen, so it arrives read.
       *
       * Without this the first launch after the read set shipped would open the
       * bell at the entire history, which is the number you learn to ignore — the
       * same reason the old count was baselined at mount. Anything that arrives
       * AFTER launch comes in unread, including a briefing swept out of the tray:
       * that one was delivered while the app was dead and has genuinely not been
       * looked at.
       */
        remember(chat.map(itemId));
      })
    );
    return l.end;
  }, [remember]);

  const chat = hud.chat;
  /**
   * Debounced, and flushed the moment the app stops being looked at.
   *
   * The debounce is right and the reason is in `chatStore`: a status frame can arrive
   * three times a second and each one would otherwise be a disk write of the whole
   * log. But 400ms of unwritten conversation is 400ms of conversation that dies with
   * the process — and a process here does not always get to finish. **Two turns were
   * lost this way on 2026-08-21**, when the app was force-stopped to apply an update
   * moments after they were sent.
   *
   * So: still debounced while the app is in front, and written immediately on the way
   * out. `background` and `inactive` both count — a power-button press goes
   * `active → inactive → background`, and Android is entitled to kill the process
   * before the second one arrives.
   */
  const latest = useRef(chat);
  latest.current = chat;
  useEffect(() => {
    const timer = setTimeout(() => void saveChat(chat), 400);
    return () => clearTimeout(timer);
  }, [chat]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void saveChat(latest.current);
    });
    return () => sub.remove();
  }, []);

  /**
   * Hand the gateway this install's push address, once, per cloud link.
   *
   * Only over cloud: the desk serves no such route, and only the gateway knows
   * when the desk attaches. Registration is deliberately silent — a gateway that
   * does not serve the route yet answers 404, which is not something to put in
   * front of the user, and the next connect tries again.
   */
  /**
   * Send the gateway the schedule it needs to push a briefing.
   *
   * The phone resolves the coordinates before sending, because `KnownPlace` only
   * exists here — see `commutePayload`, which also decides that a departure
   * switched off travels as an absence rather than as a flag.
   *
   * Silent on failure and deliberately so: this is a best-effort mirror of a
   * setting whose authority is the phone. A failed sync costs one stale schedule
   * until the next connect, and there is no screen this could report to that is
   * not already showing the setting itself.
   */
  const syncCommute = useCallback(async () => {
    if (simulated) return;
    try {
      await api.syncCommute(commutePayload(await loadCommute(), await loadKnown()));
      /**
       * The gateway now holds the schedule, so the phone's own task stands down.
       *
       * Stamped only on success, and only here: this is the one place that knows
       * the upload was accepted rather than attempted. Without it the local task
       * posts as well and the briefing arrives twice, which is what happened on
       * 2026-08-21. `cloudArmed` in `lib/commute.ts` carries the reasoning.
       */
      await markCloudArmed();
    } catch {
      // the next connect re-sends it, and the stamp is left alone — an upload that
      // failed must not silence the phone's fallback
    }
  }, [api, simulated]);

  /**
   * Mirror the schedule on every cloud connect.
   *
   * Same reasoning as the push registration below, and the same recovery: the
   * gateway loses its state on redeploy, and the phone is the authority. Sending
   * on connect means a wiped gateway is repaired by the next time the app comes
   * up rather than by remembering to press something.
   */
  useEffect(() => {
    if (link.mode !== 'cloud' || link.status !== 'open') return;
    void syncCommute();
  }, [link.mode, link.status, syncCommute]);

  /**
   * Whether the gateway has an address for this phone.
   *
   * Kept because it is the single most diagnostic fact in the app and nothing used
   * to expose it: with no token there is no briefing, no desk-watch alert and
   * nothing unprompted, and the app looked identical either way. The Home status
   * panel reads it.
   *
   * `unasked` is a third state on purpose. Registration only runs on a cloud
   * connect, so before one there is nothing to report — and `no-token` shown then
   * would send someone hunting a fault that does not exist. `no-token` rather than
   * `refused` because `registerForPush` returns null for a denied permission and
   * for any other failure alike, and this must not claim to know which.
   */
  const [push, setPush] = useState<'registered' | 'no-token' | 'unasked'>('unasked');

  useEffect(() => {
    if (simulated || link.mode !== 'cloud' || link.status !== 'open') return;
    const l = live();
    void registerForPush().then(
      l.only((push) => {
        setPush(push ? 'registered' : 'no-token');
      if (!push) return;
      // Silent on failure, and unguarded on purpose. Registering is idempotent
      // server-side — it keys on the address — so re-sending costs one small POST
      // per connect and buys the only recovery there is from the gateway losing
      // its list. It does lose it: Render's free disk is wiped on every redeploy,
      // and a "register once per address" guard left the phone unreachable by push
      // until the app was restarted. It also went stale on a rotated token, since
      // the address had not changed but the credential had.
      // The channel names go with it. Only this phone knows what it called them,
      // and a push addressed to a channel Android does not have is discarded
      // without a word — which is what broke every reply push after this app
      // renamed its everyday channel, eight times over.
        void api
          .registerPush(push, Platform.OS, { general: GENERAL_CHANNEL, watch: WATCH_CHANNEL })
          .catch(() => {});
      })
    );
    return l.end;
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

    const l = live();
    void alertFromLaunch().then(
      l.only((alert) => {
        if (alert) raise(alert);
      })
    );
    const off = onAlertTapped(raise);
    return () => {
      l.end();
      off();
    };
  }, []);

  /**
   * A reply that arrived as a push belongs in the conversation, not only in the shade.
   *
   * The gateway pushes the answer when it cannot reach the phone over the socket
   * — which, since `LinkMachine.suspend` closes on background, is every turn you
   * start and then pocket. Nothing here consumed those, so the answer was shown
   * as a notification and never entered the log: you came back to your own
   * question, no answer under it, and a typing indicator still going. Reported
   * from the device on 2026-08-19, and it is the missing half of the pocketed-
   * reply fix rather than a separate bug — the push was arriving all along.
   *
   * Dispatched as a `status` frame so it takes the reducer's existing path: the
   * chat gains a J.A.R.V.I.S. turn, `speaking` clears the thinking state, and the
   * consecutive-duplicate guard there collapses the case where the same answer
   * arrives twice — once pushed, once down a socket that reopened underneath it.
   */
  useEffect(() => {
    const take = (reply: PushedReply) =>
      dispatch({
        type: 'frame',
        frame: { kind: 'status', status: 'speaking', message: reply.text, user: null },
        // the notification's own arrival time when it has one, which the tray
        // sweep does. A briefing pushed at 8 AM is swept whenever the app is next
        // opened — stamping `now` filed it under lunchtime, above the things that
        // really did come after it, and the panel's order was then a lie
        at: reply.at ?? Date.now(),
      });

    const l = live();
    // the cold-start case: tapped while the app was dead, so no listener ever saw it
    void replyFromLaunch().then(
      l.only((reply) => {
        if (!reply) return;
        take(reply);
        // launched BY the notification, so the conversation is the destination.
        // `openChat` checks the navigator is ready first — on a cold start this
        // runs before it has mounted, and navigating then is silently dropped
        openChat();
      })
    );
    /**
     * A tapped reply opens the conversation; an arriving one does not.
     *
     * Tapping the answer is a request to see it — landing on whatever tab
     * happened to be open, with the reply somewhere behind it, is the version of
     * this that was reported. An answer that merely ARRIVES is different: yanking
     * him out of the screen he chose would be the app deciding for him.
     */
    const off = onPushReply((reply, tapped) => {
      take(reply);
      if (tapped) openChat();
    });

    /**
     * And on every return, read the shade rather than trusting we were told.
     *
     * Neither listener covers the ordinary case. `addNotificationReceivedListener`
     * fires only while the app is FOREGROUNDED, and the response listener only
     * when a notification is actually tapped — so asking something, pocketing the
     * phone, and coming back by tapping the app icon hit neither. The answer was
     * delivered, shown in the shade, and never entered the conversation.
     * Reported from the device after the listener work that was meant to fix
     * precisely this.
     *
     * Reconciling on `active` asks what is really in the tray. The reducer's
     * consecutive-duplicate guard absorbs anything already taken in, so reading
     * the same notification twice costs nothing.
     */
    const sweep = () => {
      void pendingReplies().then(
        l.only((replies) => {
          for (const reply of replies) take(reply);
        })
      );
    };
    sweep();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') sweep();
    });

    return () => {
      l.end();
      off();
      sub.remove();
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

  /**
   * The log as it stands, for marking read without depending on it.
   *
   * `markChatRead` has to see the current turns — it is what clears them from the
   * bell — but it must NOT change identity when they arrive. The Chat screen holds
   * it in a `useFocusEffect` dependency list, so a new identity per turn would tear
   * that effect down and set it up again on every reply, flapping `chatFocused` on
   * the way through. A ref moves the value without moving the function.
   */
  const chatNow = useRef(hud.chat);
  useEffect(() => {
    chatNow.current = hud.chat;
  }, [hud.chat]);

  /**
   * Reading the conversation clears BOTH counts, which it did not until 2026-08-27.
   *
   * There are two of them and they answer different questions: `readAt` below is a
   * timestamp behind Home's "N new replies", and `readIds` is the persisted set
   * behind the bell. Only the Activity panel ever wrote to the second, so reading
   * the chat cleared its own marker and left the bell counting the very turns you
   * had just read — reported from the device, and a count you cannot clear by
   * reading is a count you stop reading.
   *
   * **Chat turns only.** `timeline` is given an empty trace on purpose: a step the
   * agent took is not something you saw by reading the conversation, and marking it
   * read here would be the same lie in the other direction.
   */
  const markChatRead = useCallback(() => {
    setReadAt(Date.now());
    remember(countable(timeline(chatNow.current, [])).map((i) => i.id));
  }, [remember]);
  const unread = useMemo(
    () => hud.chat.filter((c) => c.from === 'jarvis' && c.at > readAt).length,
    [hud.chat, readAt]
  );

  const chatFocused = useRef(false);
  const setChatFocused = useCallback((focused: boolean) => {
    chatFocused.current = focused;
  }, []);

  /**
   * A reply that lands while you are watching it arrive has been seen.
   *
   * The screen marks read on the way in and on the way out, which leaves the gap in
   * between: the tab bar carried `2` on the Chat tab while the chat was open on the
   * two answers it was counting. `chatFocused` is a ref and changing it re-renders
   * nothing, which is why this hangs off the log rather than off the flag — the log
   * changing is the only moment the question can be newly wrong.
   */
  useEffect(() => {
    if (!chatFocused.current) return;
    markChatRead();
  }, [hud.chat, markChatRead]);

  /**
   * Unread activity, per entry, for the count on the bell and the marks in the panel.
   *
   * The bell carried a dot driven by `parked.length`, which answered "is anything
   * blocked" and nothing else — so a timeline full of things you had not seen
   * looked identical to an empty one. It then carried a count derived from one
   * mount-time timestamp, which answered "is any of this newer than this launch".
   * Neither could answer the panel's own question: which of these have I looked at.
   *
   * So it is a set of ids now, persisted by `readStore`. Two things follow:
   * reading one entry leaves its neighbours alone, and a mark survives a restart —
   * previously every relaunch re-marked the whole log unread, which is how a number
   * on a bell stops being read.
   *
   * Parked approvals are counted separately by the bell and deliberately **not**
   * cleared by marking things read — an approval is not something you can read
   * away, it needs a decision.
   */
  /**
   * Only things that happened *to* him, and only things with something to read.
   *
   * The timeline shows "You sent" entries and they belong there — it is a record of
   * what happened, both directions. A count on a bell is a different claim: it says
   * "there is something here you have not seen", and you have seen the message you
   * just typed. Counting it meant sending one thing put 1 on the bell instantly.
   *
   * `countable` in `activity.ts` is that rule, shared with the panel so the number
   * on the bell can only ever describe entries the panel actually shows.
   */
  const alertsUnread = useMemo(
    () => countable(timeline(hud.chat, hud.trace)).filter((i) => !readIds.has(i.id)).length,
    [hud.chat, hud.trace, readIds]
  );

  const markAlertsRead = useCallback(
    () => remember(countable(timeline(hud.chat, hud.trace)).map((i) => i.id)),
    [hud.chat, hud.trace, remember]
  );

  const markRead = useCallback((id: string) => remember(id ? [id] : []), [remember]);

  /**
   * Withdraw a turn that never left the phone, because it is being sent again.
   *
   * Only a failed one is withdrawable — the reducer enforces that. Anything the far
   * end received stays in the record whatever became of its answer.
   */
  const dropTurn = useCallback((at: number) => dispatch({ type: 'turn_drop', at }), []);

  /** take one of your own turns out of the log, in any state. His cannot be removed */
  const removeTurn = useCallback((at: number) => dispatch({ type: 'turn_remove', at }), []);

  /**
   * Whether the app is on screen, which is what decides if a reply is announced.
   *
   * Read from a ref rather than from state because the effect below must see the
   * value at the moment the reply lands, and a re-render is not guaranteed between
   * the two.
   */
  const appActive = useRef(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      appActive.current = next === 'active';
    });
    return () => sub.remove();
  }, []);

  const notifiedFor = useRef<number>(0);
  /**
   * The baseline, and why it is not simply `notifiedFor === 0`.
   *
   * The old code took its "everything before this is old news" mark from the first
   * *J.A.R.V.I.S.* turn it saw. If the restored log ended on a **user** turn — the
   * app killed right after asking, which is exactly when it gets killed — the
   * effect returned early without setting the mark, so the next real reply was read
   * as the first pass and swallowed. One notification lost per launch, always the
   * one that mattered.
   *
   * Marked from any entry instead, so a trailing user turn cannot leave the
   * baseline unset. `hydrate` prepends the restored log, so the tail is the newest
   * turn either way.
   */
  const baselined = useRef(false);
  useEffect(() => {
    const newest = hud.chat[hud.chat.length - 1];
    if (!newest) return;
    if (!baselined.current) {
      baselined.current = true;
      notifiedFor.current = newest.at;
      return;
    }
    if (newest.from !== 'jarvis') return;
    if (newest.at <= notifiedFor.current) return;
    notifiedFor.current = newest.at;
    if (!shouldNotifyReply({ appActive: appActive.current, simulated })) return;
    void postNow({
      // the name alone, not "J.A.R.V.I.S. replied" — a butler does not announce that
      // he is about to speak, and the body is the reply itself
      title: 'J.A.R.V.I.S.',
      body: newest.text.length > 140 ? `${newest.text.slice(0, 139)}…` : newest.text,
      // marked local so the push listener does not feed this back into the chat:
      // the text is already in the log, and re-injecting it would be an echo
      data: { kind: 'reply', local: true },
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
      title: 'At your disposal, sir',
      body: 'Desk online. PC control, files and the terminal, all yours again.',
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
      sendPhoto,
      api,
      decide,
      answerWatch,
      expireWatch,
      deskAsset,
      pairing,
      pair,
      recent,
      clearRecent: () => setRecent([]),
      unread,
      alertsUnread,
      markAlertsRead,
      markRead,
      readIds,
      dropTurn,
      removeTurn,
      push,
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
      syncCommute,
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
      // both were omitted while only `sendCommand` was listed. They close over
      // `link`, so a memo that does not refresh with them hands a screen a sender
      // pointing at a socket that has since been replaced.
      sendVoice,
      sendPhoto,
      api,
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
      syncCommute,
      unread,
      alertsUnread,
      markAlertsRead,
      markRead,
      readIds,
      dropTurn,
      removeTurn,
      push,
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
