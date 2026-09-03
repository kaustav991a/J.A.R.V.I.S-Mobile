import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Image, FlatList, Pressable, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { HeaderHeightContext } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CommandBar } from '../components/CommandBar';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { situationLine } from '../lib/situation';
import * as Clipboard from 'expo-clipboard';
import { turnMark } from '../lib/turnMark';
import { captionOf } from '../lib/photoTurn';
import { anticipate } from '../lib/anticipate';
import { loadSpoken, noteSpoken } from '../lib/spokenStore';
import {
  absentFrom,
  daysSeenAt,
  elsewhereNow,
  hereEarly,
  leftEarly,
  loadSeen,
  placesSeen,
  nextSeenElsewhere,
  stillHereLate,
  usuallyGoneBy,
} from '../lib/timeline';
import { appDeltas, usageForAsk } from '../lib/journal/rollup';
import { openJournal } from '../lib/journal/store';
import { dayKey, dueToday, loadCommute, scheduleDrift } from '../lib/commute';
import { msToNextMinute } from '../theme/greeting';
import { EmptyState } from '../components/ui/Atoms';
import { Touchable } from '../components/ui/Touchable';
import { Glass } from '../components/ui/Glass';
import { useToast } from '../components/ui/Toast';
import { RichText } from '../components/ui/RichText';
import { useReveal } from '../components/ui/useReveal';
import { plainText } from '../lib/rich';
import { CHROME, COLOR, RADIUS, SCRIM, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { MIN_CLIP_MS, RECORDING, meterLevel, prepareToRecord, readClip } from '../lib/voice';
import { haptic } from '../lib/haptics';
import { useAuth } from '../security/AuthProvider';
import { useJarvis } from '../state/JarvisProvider';
import { EARLIER_PAGE, earlierThan } from '../state/chatStore';
import { takeShot } from '../lib/vision';
import type { ChatEntry } from '../state/hudReducer';
import type { CommandsStackParams } from '../navigation/types';

const SUGGESTIONS = ['system status', 'open browser', 'take screenshot', 'list files'];

/**
 * Roughly the length of Android's own keyboard animation, so the composer looks
 * like it is riding the keyboard rather than chasing it. Decelerating, because it
 * is following something that has already started moving.
 */
/** how often the recorder is polled for its level; 100ms reads as continuous */
const METER_MS = 100;
/** slide distances, in points, for hands-free and for throwing the clip away */
const LOCK_SLIDE_PX = 64;
const CANCEL_SLIDE_PX = 96;

const KEYBOARD_MS = 220;
const KEYBOARD_EASE = Easing.out(Easing.quad);

/**
 * How long the dots wait before admitting nothing is coming.
 *
 * Past a cold start on Render's free tier — which spins down after fifteen minutes
 * idle and costs the better part of a minute on the next request — and well past
 * inference on top of it.
 */
const REPLY_TIMEOUT_MS = 120_000;

/**
 * The day rules and the clock, shared with the Activity panel.
 *
 * Re-exported because the chat's own tests import `dayHeading` from here, and
 * because this is still the screen the rules were written for — the panel is the
 * borrower. The comments on why each rule exists live at the definitions.
 */
export { dayHeading } from '../lib/day';
import { clockLabel as clock, dayHeading, dayOf } from '../lib/day';

/**
 * The conversation, both directions, as it happens.
 *
 * This is the tab that used to be a command box over a list of past strings.
 * Once voice lands, a transcript is just another user turn, so the same panel
 * carries it — there is no separate voice surface to build.
 *
 * It does not use `Screen`: a chat is a list pinned to a composer, not a page
 * that scrolls as a whole. The list is inverted, which is what keeps the newest
 * turn against the composer while the keyboard opens and closes.
 */
export function ChatScreen() {
  const nav = useNavigation<NativeStackNavigationProp<CommandsStackParams>>();
  const insets = useSafeAreaInsets();
  const headerHeight = useContext(HeaderHeightContext);
  const { accent, animations } = useAppearance();
  const { hud, sendCommand, sendVoice, sendPhoto, resendPhoto, connected, markChatRead, setChatFocused, mode, place, dropTurn, removeTurn, noteUnprompted } =
    useJarvis();

  /**
   * On screen means read, and means no notification.
   *
   * `useFocusEffect` rather than a mount effect: this screen stays mounted while
   * other tabs are shown, so mounting says nothing about whether it is being
   * looked at. Marked read on the way in *and* on the way out — a reply that
   * arrives while the chat is open has been seen, so leaving must not leave it
   * counted as unread.
   */
  useFocusEffect(
    useCallback(() => {
      setChatFocused(true);
      markChatRead();
      return () => {
        setChatFocused(false);
        markChatRead();
      };
    }, [markChatRead, setChatFocused])
  );
  const { holdGate } = useAuth();
  const toast = useToast();
  const list = useRef<FlatList<ChatEntry>>(null);

  /**
   * Turns read back from the archive, above the live window.
   *
   * `CHAT_CAP` renders a hundred, which is about a day, and everything before that
   * lives in the archive rather than in the reducer. Kept here rather than dispatched
   * into the log deliberately: the state the app runs on stays the recent window, and
   * reading further back is a thing this screen does, not a thing the app carries.
   */
  const [earlier, setEarlier] = useState<ChatEntry[]>([]);
  const [reachedStart, setReachedStart] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  const loadEarlier = async () => {
    const oldest = earlier[0]?.at ?? hud.chat[0]?.at;
    if (!oldest || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const page = await earlierThan(oldest, EARLIER_PAGE);
      // deduped on the timestamp, which is the log's own identity for a turn: the
      // window and the archive overlap by design, and a turn shown twice reads as the
      // app having said it twice
      const held = new Set([...earlier, ...hud.chat].map((t: ChatEntry) => t.at));
      const fresh = page.filter((t) => !held.has(t.at));
      if (!fresh.length) setReachedStart(true);
      else setEarlier((was) => [...fresh, ...was]);
    } catch {
      setReachedStart(true);
    } finally {
      setLoadingEarlier(false);
    }
  };

  // newest first, because the list is inverted, and the archive sits below the window
  const turns = [...earlier, ...hud.chat].reverse();
  const thinking = hud.status === 'thinking' || hud.status === 'agent';

  /**
   * Waiting on a reply we have asked for, whatever the far end has said about it.
   *
   * Cleared by the answer arriving rather than by a timer: the newest turn being
   * his is the only thing that actually means the wait is over. A voice clip
   * clears it too, since its transcript comes back as a turn.
   */
  const [pending, setPending] = useState(false);
  /**
   * The clock behind the line at the top, ticking on the minute.
   *
   * On the minute rather than the second: the line prints minutes, and a timer
   * running sixty times more often than the thing it updates is sixty times the
   * wakeups for no visible difference.
   */
  const [minute, setMinute] = useState(() => new Date());
  /**
   * Only while the screen is actually being looked at.
   *
   * This screen stays mounted behind the tab bar for the life of the app, so an
   * unconditional timer is a wakeup a minute forever for a line nobody can see —
   * on a phone that is also holding a socket and a journal. Gating on focus
   * costs one render when the tab is opened and nothing at all in between.
   *
   * The date is re-read on focus too, so coming back to a stale clock shows the
   * right time immediately rather than at the next boundary.
   */
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    setMinute(new Date());
  }, [focused]);
  useEffect(() => {
    if (!focused) return;
    const t = setTimeout(() => setMinute(new Date()), msToNextMinute());
    return () => clearTimeout(t);
    // re-armed by its own result: one timeout aimed at the next boundary keeps the
    // clock honest, where a 60s interval drifts away from it
  }, [minute, focused]);

  /** the next briefing owed today, so he can mention it before it happens */
  const [nextBriefing, setNextBriefing] = useState<{ hour: number; minute: number; label: string } | null>(null);

  /**
   * Read on focus rather than on mount: the Places screen can change the schedule
   * while this screen stays alive behind the tab bar, and a line promising a
   * briefing that was switched off an hour ago is worse than no line.
   *
   * Placed directly under the state it writes, which is not merely tidy — it sat
   * seventy lines ABOVE it at first. React defers a focus callback to an effect so
   * the setter is assigned by the time it runs, and it worked; a test that invokes
   * the callback during render hit the temporal dead zone and said so. The order
   * was wrong either way, and only the harness was in a position to notice.
   */
  /**
   * The unprompted remark, if there is one to make.
   *
   * Assembled from what the phone already holds — the journal against its own
   * baseline, the next departure, the place — and decided in code by
   * `lib/anticipate.ts`. Never by a model: asked whether something is worth saying,
   * a model always finds something, which is precisely how the gateway announced a
   * Saturday shift that did not exist.
   *
   * Marked spoken the moment it is shown rather than when it is read, because "at
   * most one a day" has to hold against a screen that is opened twenty times.
   */

  /**
   * The turn whose menu is open, or null.
   *
   * Only ever one of yours. His turns are the record of what was said to you, and a
   * conversation where either side can be edited is not a record of anything — so
   * the long press is not even offered on them.
   */
  const [menuFor, setMenuFor] = useState<ChatEntry | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void dueToday(new Date()).then((d) => {
        if (alive) setNextBriefing(d);
      });
      void (async () => {
        try {
          const now = new Date();
          const journal = await openJournal();
          const [spokenBefore, departure, usage, seen, apps, commute] = await Promise.all([
            loadSpoken(),
            dueToday(now),
            usageForAsk(journal, now.getTime()).catch(() => null),
            loadSeen(),
            appDeltas(journal, now.getTime()).catch(() => []),
            loadCommute(),
          ]);
          if (!alive) return;
          const said = anticipate({
            now,
            // no baseline means no usage remark: "unusual" against nothing is not a
            // finding, and `usual` is null until the journal has enough days
            usage:
              usage && typeof usage.usual === 'number'
                ? { today: usage.today, usual: usage.usual, days: usage.days }
                : null,
            departure: departure ? { label: departure.label, hour: departure.hour, minute: departure.minute } : null,
            // a fidgety day is not the same fact as a heavy one, and a total hides it
            pickups:
              usage && typeof usage.usualPickups === 'number'
                ? { today: usage.pickups, usual: usage.usualPickups, days: usage.days }
                : null,
            place,
            /**
             * Whether he is somewhere he is usually gone from by now.
             *
             * Both come from the same history, and both are needed: the boolean
             * decides whether to speak and the figure is what makes the remark
             * arguable. A remark that cannot name its own basis is the thing this
             * whole feature refuses to make.
             */
            stillHereLate: place ? stillHereLate(seen, place, now) : false,
            // the hour he is usually somewhere ELSE, which is the only bound the
            // sightings can put on leaving — the last-seen median said 3:40 PM about
            // an office he leaves at seven
            goneBy: place ? nextSeenElsewhere(seen, place, now)?.minute ?? null : null,
            goneTo: place ? nextSeenElsewhere(seen, place, now)?.place ?? null : null,
            // the app that moved, rather than the day that did. Already sorted by
            // how far each is past its own usual, so the first is the finding
            topApp: apps[0] ?? null,
            // only about where he is standing: arriving early somewhere else is not
            // an observation, it is arithmetic on a place he has left
            early: place
              ? (() => {
                  const e = hereEarly(seen, place, now);
                  return e ? { place, ...e } : null;
                })()
              : null,
            /**
             * Missing from somewhere he is usually at by now.
             *
             * Every place the store has ever seen, because the one he is NOT at is
             * by definition not the one the phone can report. `absentFrom` matches
             * the weekday and returns null the moment he has been seen there today,
             * so the loop cannot accuse him of missing a place he is standing in.
             */
            absent:
              placesSeen(seen)
                .map((label) => {
                  const a = absentFrom(seen, label, now);
                  return a ? { place: label, ...a } : null;
                })
                .find(Boolean) ?? null,
            /**
             * Gone from somewhere earlier than this weekday usually goes.
             *
             * Every place the log knows, because the interesting one is the place he
             * has *left* — by definition not the place the phone can see him at.
             * `leftEarly` refuses unless he is demonstrably somewhere else, so this
             * cannot fire about a room he is standing in.
             */
            left:
              placesSeen(seen)
                .map((label) => leftEarly(seen, label, now, place))
                .find(Boolean) ?? null,
            /** somewhere his own weekdays say he is not, naming where he usually is */
            elsewhere: elsewhereNow(seen, place, now),
            // the schedule he typed against the hour he is measurably gone by
            schedule: scheduleDrift(commute, now, (label) => ({
              goneBy: usuallyGoneBy(seen, label, now),
              days: daysSeenAt(seen, label, now),
            })),
            spokenBefore,
          });
          if (!said) return;
          // and into the log, so tomorrow can still see what he noticed today
          noteUnprompted(said.line, now.getTime());
          await noteSpoken(said.about, dayKey(now));
        } catch {
          // a remark is the most optional thing in this app; nothing it needs may
          // ever be the reason the chat fails to open
        }
      })();
      return () => {
        alive = false;
      };
    }, [place, minute, noteUnprompted])
  );

  /** a photo taken and not yet sent. Null is the ordinary state of this screen. */
  const [draft, setDraft] = useState<{ base64: string; uri: string } | null>(null);
  /**
   * A caption handed back after a failed send.
   *
   * Kept here rather than inside `CommandBar` because the bar owns its field and
   * clears it on submit — which is right for every other send. This is the one
   * case where the text has to survive being submitted.
   */
  const [restoredCaption, setRestoredCaption] = useState<string | null>(null);
  const newest = turns[0];
  useEffect(() => {
    if (newest?.from === 'jarvis') setPending(false);
  }, [newest]);

  /**
   * Give up eventually, and say so.
   *
   * Dots that never stop are a worse lie than no dots: they claim an answer is
   * coming from a socket that may have dropped without anyone noticing. Two
   * minutes is past a cold start on Render's free tier and well past inference, so
   * anything still outstanding is not on its way.
   */
  useEffect(() => {
    if (!pending) return;
    const giveUp = setTimeout(() => {
      setPending(false);
      toast.show('No reply — the brain may be asleep', 'bad');
    }, REPLY_TIMEOUT_MS);
    return () => clearTimeout(giveUp);
  }, [pending, toast]);

  const waiting = thinking || pending;

  useEffect(() => {
    if (turns.length) list.current?.scrollToOffset({ offset: 0, animated: true });
  }, [turns.length]);

  /**
   * Lift the composer by the keyboard's measured height.
   *
   * `softwareKeyboardLayoutMode: resize` does not resize an edge-to-edge
   * Android window — the app owns its insets there, and assuming otherwise is
   * what left the composer sitting under the keyboard with the newest turn
   * hidden behind it. So take the height the event reports and pad by it.
   */
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      list.current?.scrollToOffset({ offset: 0, animated: true });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    /**
     * `keyboardWillHide` as well, and not as a nicety.
     *
     * Reported from the device: the composer went up with the keyboard and
     * stayed there after it went down. `keyboardDidHide` does not reliably fire
     * on Android 15 under edge-to-edge when the keyboard is dismissed by the
     * back gesture rather than by tapping away — so the height stayed at its
     * last value and the composer sat stranded above where it belongs.
     *
     * Two listeners for one transition is not duplication: `setKeyboardHeight(0)`
     * twice is the same state, and either one arriving is enough.
     */
    const willHide = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
      willHide.remove();
    };
  }, []);

  const typing = keyboardHeight > 0;

  const send = (text: string) => {
    // Dots from the moment it is sent, not from the moment the far end admits it
    // is working. Render's free tier spins down after fifteen minutes idle, so the
    // first message of an evening waits the better part of a minute before any
    // `thinking` frame arrives — and a chat that shows nothing at all in that gap
    // reads as a message that was never delivered.
    setPending(true);
    void sendCommand(text).catch(() => {});
    if (!connected) toast.show('No link — answered locally', 'bad');
  };

  /**
   * Take a photo and stage it, so it can be asked about before it goes.
   *
   * `holdGate` around the whole thing, for the reason the microphone needed it: the
   * app-lock gate treats any departure as the phone leaving your hand, and the
   * camera is a full-screen system activity — without this, opening the camera
   * raised a fingerprint prompt over it, and coming back raised another.
   *
   * **This used to send on the shutter.** The reasoning was written down and it was
   * half right: "a photo is usually the question, and asking someone to type before
   * they can send one is a step they will not take." True about the common case,
   * and it cost the uncommon one entirely — there was no way to ask anything
   * *specific* about a picture, and no way to notice you had photographed the wrong
   * thing. The gateway had always accepted a caption; the phone never offered one.
   *
   * So the fast path stays exactly as fast: SEND with an empty field sends the
   * photo alone, which is one extra tap on the same button people already reach
   * for. The step is around the send rather than in front of it.
   */
  const takeDraft = async () => {
    // Deliberately no pre-flight link check. There was one, and it refused before
    // the camera had even opened — which is the wrong call twice over: the link is
    // usually about to come back, and the camera itself is what takes it away, so
    // the state before is not the state that matters. `sendPhoto` waits instead.
    // `finally`, because an unreleased hold used to disable the app lock for the
    // whole life of the process — the gate reads the flag on every departure and
    // returns early. The provider now expires a hold on its own as well; this is
    // the half that keeps it from ever needing to.
    holdGate(true);
    let result: Awaited<ReturnType<typeof takeShot>>;
    try {
      result = await takeShot('camera');
    } finally {
      holdGate(false);
    }
    if (!result.ok) {
      // changing your mind is not a failure and gets no toast
      if (!result.cancelled) toast.show(result.problem, 'bad');
      return;
    }
    setDraft(result.shot);
    haptic.good();
  };

  /**
   * Send the staged photo with whatever was typed under it.
   *
   * The draft is cleared BEFORE the await and put back on failure. Leaving it on
   * screen during the send would invite a second tap on a photo already in
   * flight, and a duplicate is worse than a moment's uncertainty — the typing
   * indicator covers the gap.
   */
  const sendDraft = async (caption: string) => {
    const shot = draft;
    if (!shot) return;
    setDraft(null);
    const sent = await sendPhoto(shot, caption);
    if (sent) {
      setPending(true);
      haptic.good();
    } else {
      // Named distinctly from every other failure on this screen. Both photo
      // failures used to say "No link", so a report of "it says no link" could not
      // say which had happened — and that cost a diagnosis.
      //
      // The draft comes back, and the caption with it. A typed question lost to a
      // dropped socket would be worse than the immediate send this replaced.
      setDraft(shot);
      setRestoredCaption(caption);
      toast.show('Photo not sent — the link never came back', 'bad');
    }
  };

  /**
   * Hold the mic to record, release to send.
   *
   * Tap-to-start/tap-to-stop was the alternative and is worse here: a recording
   * left running because the second tap missed is a live microphone the user
   * thinks is off. A press that ends when the finger lifts cannot be left on.
   *
   * The clip goes as a base64 envelope and nothing is written to the chat — the
   * gateway transcribes it and sends the transcript back as its own frame, which
   * the reducer logs as *him* speaking. A local placeholder turn would put the
   * same sentence in the log twice.
   */
  const recorder = useAudioRecorder(RECORDING);
  const recorderState = useAudioRecorderState(recorder, METER_MS);
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [cancelProgress, setCancelProgress] = useState(0);
  const startedAt = useRef(0);
  /** where the finger went down, so the slides are measured from it */
  const origin = useRef<{ x: number; y: number } | null>(null);
  /** set when the gesture asked to throw the clip away, read by the release */
  const cancelled = useRef(false);
  const lockedRef = useRef(false);

  /**
   * The timer is the app's own, not the recorder's.
   *
   * `recorderState.durationMillis` only updates as fast as the metering interval,
   * which makes the seconds visibly stutter. Elapsed time is trivially derivable
   * from when the press started, so it is.
   */
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 200);
    return () => clearInterval(timer);
  }, [recording]);

  const level = meterLevel(recorderState.metering);

  /**
   * Slide up to go hands-free, slide left to throw it away.
   *
   * Measured from where the finger went down rather than from the button's
   * position, so it works wherever the composer happens to be sitting — it moves
   * with the keyboard.
   *
   * Cancel is only *armed* here; the clip is discarded on release. Dropping it
   * mid-gesture would take the recorder away from under a finger still holding it,
   * and there would be nothing left to change your mind about.
   */
  const onVoiceMove = (x: number, y: number) => {
    if (!origin.current || lockedRef.current) return;
    const dx = x - origin.current.x;
    const dy = y - origin.current.y;
    if (-dy > LOCK_SLIDE_PX && Math.abs(dx) < Math.abs(dy)) {
      lockedRef.current = true;
      setLocked(true);
      setCancelProgress(0);
      haptic.good();
      return;
    }
    setCancelProgress(Math.max(0, Math.min(1, -dx / CANCEL_SLIDE_PX)));
    cancelled.current = -dx >= CANCEL_SLIDE_PX;
  };

  const startRecording = async (x?: number, y?: number) => {
    if (recording) return;
    origin.current = x !== undefined && y !== undefined ? { x, y } : null;
    cancelled.current = false;
    lockedRef.current = false;
    setLocked(false);
    setCancelProgress(0);
    setElapsedMs(0);
    if (!connected) {
      toast.show('No link — nothing to transcribe the clip', 'bad');
      return;
    }
    // The microphone request is a system dialog, and the app-lock gate reads any
    // departure as the phone leaving your hand — so asking to record answered
    // itself with a fingerprint prompt. Held across the request, released after.
    // released in a `finally` for the reason `sendShot` is: a hold that never
    // comes back leaves the app lock silently switched off
    holdGate(true);
    let allowed: boolean;
    try {
      allowed = await prepareToRecord();
    } finally {
      holdGate(false);
    }
    if (!allowed) {
      toast.show('Microphone permission is off', 'bad');
      return;
    }
    try {
      await recorder.prepareToRecordAsync(RECORDING);
      recorder.record();
      startedAt.current = Date.now();
      setRecording(true);
      haptic.tap();
    } catch {
      toast.show('Could not start recording', 'bad');
    }
  };

  /**
   * End the recording, and either send it or bin it.
   *
   * `discard` comes from two places: the slide-left gesture, armed during the hold
   * and read here, and the bin button while hands-free. Either way the recorder is
   * always stopped first — an abandoned clip must not leave the microphone open.
   */
  const finishRecording = async (discard: boolean) => {
    if (!recording) return;
    setRecording(false);
    setLocked(false);
    lockedRef.current = false;
    setCancelProgress(0);
    origin.current = null;
    const held = Date.now() - startedAt.current;
    try {
      await recorder.stop();
    } catch {
      toast.show('Could not finish the recording', 'bad');
      return;
    }
    if (discard) {
      haptic.bad();
      toast.show('Recording discarded');
      return;
    }
    // a tap that arrived as a press produces a few hundred ms of room noise, and
    // Whisper answers that with either nothing or an invented sentence
    if (held < MIN_CLIP_MS) {
      toast.show('Hold the mic to speak', 'bad');
      return;
    }
    const uri = recorder.uri;
    if (!uri) {
      toast.show('The recording came back empty', 'bad');
      return;
    }
    const clip = await readClip(uri);
    if (!clip) {
      toast.show('Could not read the recording', 'bad');
      return;
    }
    const sent = await sendVoice(clip);
    if (sent) {
      // the transcript comes back as a turn, so the same wait applies
      setPending(true);
      haptic.good();
    } else toast.show('No link — the clip was not sent', 'bad');
  };

  /**
   * The finger lifted.
   *
   * Hands-free is the exception: lifting is what *arms* it, so the release must not
   * also end the recording. From then on only the bin and send buttons do.
   */
  const onRelease = () => {
    if (lockedRef.current) return;
    void finishRecording(cancelled.current);
  };

  // iOS lifts the whole view itself, so only Android pays the keyboard height
  const lift = Platform.OS === 'android' ? keyboardHeight : 0;
  // 20 clear of the keyboard: sitting flush on it leaves the field looking
  // stuck to the keys, and the newest turn crowded right behind the composer
  const bottom = typing
    ? lift + SPACE.xl
    : CHROME.tabBarHeight + Math.max(insets.bottom, CHROME.tabBarGap) + SPACE.sm;

  /**
   * Glide the composer to its new resting place instead of snapping to it.
   *
   * Applying `bottom` directly moved the composer the entire keyboard height in a
   * single frame, which is the jump. This follows it instead.
   *
   * It is not keyboard-tracking: Android only reports `keyboardDidShow`, which
   * fires once the keyboard has finished coming up, so the glide starts at the
   * end of the system animation and trails it slightly. True 1:1 following needs
   * reanimated's `useAnimatedKeyboard`, which disables Android's automatic resize
   * for the *whole app* and takes over insets management — too broad a change to
   * make for one screen without being able to test the other one.
   */
  const shift = useSharedValue(bottom);
  useEffect(() => {
    shift.value = animations
      ? withTiming(bottom, { duration: KEYBOARD_MS, easing: KEYBOARD_EASE })
      : bottom;
  }, [bottom, animations, shift]);

  const composerStyle = useAnimatedStyle(() => ({ paddingBottom: shift.value }));

  return (
    <View style={styles.root} testID="chat-screen">
      <LinearGradient colors={[...SCRIM]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight ?? 0}
      >
        <View style={[styles.head, { paddingTop: Math.max(headerHeight ?? 0, insets.top) + SPACE.md }]}>
          {/*
            The situation, where the turn count used to be.

            A turn count is a statistic about the app; nobody has ever needed it.
            This line is the app's only unprompted statement about *now*, and it
            is assembled entirely on the device — no model, no network, no await.
            A greeting that waits for a round trip is a loading state wearing a
            sentence, and the first cloud call of an evening can take the better
            part of a minute here.
          */}
          <ScreenTitle
            title="CHAT"
            // it is prose, not a label — see `captionCase`
            captionCase="as-written"
            caption={situationLine({
              now: minute,
              // `lan` is the desk. Mapped here rather than in `situation.ts`,
              // which speaks about the world rather than about transports.
              mode: !connected ? null : mode === 'lan' ? 'desk' : mode === 'cloud' ? 'cloud' : null,
              connected,
              place,
              briefing: nextBriefing,
            })}
          />
          {/*
            It used to be drawn here as well, and that was one copy too many.

            The comment this replaces argued the opposite — a line rather than a turn,
            because "a turn would claim he said it in conversation" and would be
            replayed tomorrow as him volunteering something he was never asked.
            **Volunteering something unasked is the entire feature.** What was actually
            wrong was that it vanished: the WATCHING panel reported `Today: SPOKEN` over
            a log whose last entry was from the previous afternoon, and ten days of this
            working left nothing anybody could look at.

            So it is a turn now, written where the conversation is kept. Drawn in both
            places it collided with the newest bubble and said the same thing twice.
          */}
        </View>

        {turns.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              testID="chat-empty"
              text="No conversation yet"
              hint="Say something below, or tap one of these."
            />
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Touchable
                  key={s}
                  testID={`suggest-${s}`}
                  accessibilityRole="button"
                  accessibilityLabel={s}
                  onPress={() => send(s)}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>{s}</Text>
                </Touchable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={list}
            testID="chat-list"
            data={turns}
            inverted
            keyExtractor={(t, i) => `${t.at}-${i}`}
            contentContainerStyle={styles.listBody}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={waiting ? <Typing accent={accent} /> : null}
            /**
             * The way further back, at the visual top of an inverted list.
             *
             * `ListFooterComponent` because the list is inverted: the footer of the
             * data is the top of the screen, which is where "earlier" belongs and
             * where a person scrolling up arrives.
             */
            ListFooterComponent={
              reachedStart || !turns.length ? null : (
                <Pressable
                  testID="chat-earlier"
                  accessibilityRole="button"
                  accessibilityLabel="Load earlier messages"
                  onPress={() => {
                    void loadEarlier();
                  }}
                  style={({ pressed }) => [styles.earlier, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.earlierText}>
                    {loadingEarlier ? 'Reading…' : 'Load earlier'}
                  </Text>
                </Pressable>
              )
            }
            // No tap target. A reply used to open the Command Result terminal
            // view, which reads as a mis-tap: a chat bubble that navigates away is
            // not what a chat bubble does, and the terminal framing suits a run's
            // output rather than something J.A.R.V.I.S. said.
            renderItem={({ item, index }) => (
              <>
                {/* Only the newest thing HE said is paced, and only while the tab is
                    open. Index 0 is the newest turn — the list is inverted — and
                    `animations` is the existing switch for exactly this kind of
                    thing, so turning it off shows every reply whole. */}
                <Bubble
                  entry={item}
                  accent={accent}
                  reveal={index === 0 && item.from === 'jarvis' && animations && focused}
                  // the list is inverted, so index 0 is the newest turn
                  isLast={index === 0}
                  // withdraw the failed attempt, then send again: a retry is the
                  // same message having another go, not a second message
                  onLongPress={item.from === 'user' ? () => setMenuFor(item) : undefined}
                  onRetry={(text) => {
                    dropTurn(item.at);
                    /**
                     * A photo goes back as a photo, not as its caption.
                     *
                     * Sending `text` here would have re-sent the marker and the
                     * caption as an ordinary message, so the picture — the whole
                     * point of the turn, and the part that cost a walk to wherever
                     * it was taken — would silently not go. The bytes are rebuilt
                     * from the copy the log kept.
                     */
                    if (item.image) {
                      const uri = item.image;
                      void resendPhoto(uri, captionOf(text)).then((sent) => {
                        // false means the picture is gone from the cache, which is
                        // not the same as a send that failed and must not read as one
                        if (!sent) toast.show('That photo is no longer on the phone', 'bad');
                      });
                      return;
                    }
                    void sendCommand(text).catch(() => {});
                  }}
                />
                {/* The rule goes on the *oldest* turn of each day — a later index
                    is an older turn, so the boundary is where the next index is a
                    different day.

                    It is the LAST child, which looks backwards and is not. An
                    inverted list flips each cell as well as their order, so a
                    cell's children are laid out top-to-bottom and then turned
                    over: the last child is the one that ends up on top. Written
                    first, the heading rendered *underneath* the day it introduced. */}
                {index === turns.length - 1 || dayOf(turns[index + 1].at) !== dayOf(item.at) ? (
                  <DayRule at={item.at} />
                ) : null}
              </>
            )}
          />
        )}

        <Glass radius={0} sheen style={[styles.composer, composerStyle]}>
          <CommandBar
            placeholder="Message Jarvis…"
            leadingIcon="sparkles"
            onCamera={() => void takeDraft()}
            onSubmit={(text) => (draft ? void sendDraft(text) : send(text))}
            /* Only while something is staged. Everywhere else an empty SEND still
               does nothing, which is what it should do. */
            allowEmptySubmit={!!draft}
            restoreText={restoredCaption}
            onRestored={() => setRestoredCaption(null)}
            attachment={
              draft ? <PhotoDraft uri={draft.uri} onDiscard={() => setDraft(null)} /> : null
            }
            onVoiceStart={() => void startRecording()}
            onVoiceEnd={onRelease}
            onVoiceMove={(x, y) => {
              // the first move is also where the press began: `onPressIn` carries
              // no coordinates, so the origin is taken from the first touch instead
              if (!origin.current) origin.current = { x, y };
              else onVoiceMove(x, y);
            }}
            listening={recording}
            voice={{
              active: recording,
              locked,
              elapsedMs,
              level,
              cancelProgress,
              onCancel: () => void finishRecording(true),
              onSend: () => void finishRecording(false),
            }}
          />
        </Glass>
      </KeyboardAvoidingView>
      {/*
        An in-tree overlay rather than a `Modal`: RN 0.86's `Modal` is not exported
        under this jest setup, so its contents are silently absent from any test —
        the same reason the Activity detail box is built this way.
      */}
      {menuFor ? (
        <View style={styles.menuShade}>
          <Touchable
            testID="turn-menu-dismiss"
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => setMenuFor(null)}
            style={styles.menuFill}
          />
          <View testID="turn-menu" style={styles.menu}>
            <Touchable
              testID="turn-menu-copy"
              accessibilityRole="button"
              accessibilityLabel="Copy message"
              onPress={() => {
                // the words, not the markup — the same reason the screen reader gets
                // `plainText`: nobody wants asterisks on their clipboard
                void Clipboard.setStringAsync(plainText(menuFor.text));
                setMenuFor(null);
                toast.show('Copied to the clipboard');
              }}
              style={styles.menuRow}
            >
              <Ionicons name="copy-outline" size={17} color={COLOR.blue} />
              <Text style={styles.menuText}>Copy message</Text>
            </Touchable>
            <Touchable
              testID="turn-menu-remove"
              accessibilityRole="button"
              accessibilityLabel="Remove message"
              onPress={() => {
                removeTurn(menuFor.at);
                setMenuFor(null);
              }}
              style={styles.menuRow}
            >
              <Ionicons name="trash-outline" size={17} color={COLOR.red} />
              <Text style={[styles.menuText, styles.menuTextBad]}>Remove message</Text>
            </Touchable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The photo waiting above the caption box.
 *
 * Deliberately large enough to recognise the subject in — the whole reason this
 * exists is noticing you photographed the wrong thing, and a 40px square cannot
 * be checked against anything.
 */
function PhotoDraft({ uri, onDiscard }: { uri: string; onDiscard: () => void }) {
  return (
    <View style={styles.draft}>
      <Image source={{ uri }} style={styles.draftImage} resizeMode="cover" />
      <View style={styles.draftSide}>
        <Text style={styles.draftHint}>Add a question, or send it as it is.</Text>
        <Touchable
          testID="draft-discard"
          accessibilityRole="button"
          accessibilityLabel="Discard this photo"
          hitSlop={12}
          onPress={onDiscard}
          style={styles.draftDiscard}
        >
          <Ionicons name="close" size={16} color={COLOR.dim} />
          <Text style={styles.draftDiscardText}>DISCARD</Text>
        </Touchable>
      </View>
    </View>
  );
}

/**
 * The picture a turn sent, in its own bubble.
 *
 * Falls back to nothing when the uri no longer resolves. It points into the app's
 * cache, which Android may clear, and the words in `text` still say a photo was
 * sent — so a missing file costs the picture, not the record.
 */
function SentPhoto({ uri }: { uri: string }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <Image
      testID="sent-photo"
      source={{ uri }}
      style={styles.sent}
      resizeMode="cover"
      onError={() => setGone(true)}
    />
  );
}

function Bubble({
  entry,
  accent,
  onPress,
  reveal = false,
  isLast = false,
  onRetry,
  onLongPress,
}: {
  entry: ChatEntry;
  accent: string;
  onPress?: () => void;
  /** only the newest turn can still be waiting on an answer */
  isLast?: boolean;
  /** offered only where re-sending cannot repeat something already done */
  onRetry?: (text: string) => void;
  /** a menu for your own turns: copy, or take it out. Absent on his */
  onLongPress?: () => void;
  /**
   * Pace this reply on screen.
   *
   * True for the newest thing he has said and nothing else. Revealing an old turn
   * would mean the conversation retyping itself every time the list scrolled, and
   * revealing your own message would be the app pretending to think about what you
   * had just typed.
   */
  reveal?: boolean;
}) {
  const mine = entry.from === 'user';
  const shown = useReveal(entry.text, reveal);
  /**
   * Read at render rather than held in state.
   *
   * The only time-dependent case is a carried turn going unanswered, and the list
   * re-renders on focus and on every arriving frame — which is exactly when the
   * answer would have come. A ticker per bubble would be a timer per message for a
   * label that changes once.
   */
  const mark = turnMark(entry, Date.now(), isLast);
  return (
    <Touchable
      testID={`turn-${entry.at}`}
      onLongPress={onLongPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      /**
       * The WORDS, not the markup.
       *
       * The brain writes markdown and the bubble renders it since 2026-08-20.
       * Passing `entry.text` here would have the screen reader say "star star
       * ten mins star star" — and passing the parsed tree would be worse, since
       * the marks are not speakable at all. `plainText` is the same content with
       * the punctuation taken out.
       */
      // `entry.text`, not the revealed prefix: a screen reader must be given the
      // answer, not a stopwatch. Reading a growing string aloud would announce the
      // same sentence forty times.
      accessibilityLabel={`${mine ? 'You' : 'Jarvis'}: ${plainText(entry.text)}`}
      onPress={onPress}
      sink={onPress ? 0.01 : 0}
      style={[styles.turn, mine ? styles.turnMine : styles.turnTheirs]}
    >
      <View
        style={[
          styles.bubble,
          mine ? { backgroundColor: `${accent}1f`, borderColor: `${accent}44` } : styles.bubbleTheirs,
        ]}
      >
        {/* Above the words, because that is the order it was sent in. */}
        {entry.image ? <SentPhoto uri={entry.image} /> : null}
        {/*
          Rendered rather than stripped. A reply from 08:29 on 2026-08-20 had been
          sitting in this chat reading `**10 mins**: Warm-up` with its
          punctuation showing, and every list the brain had ever sent looked the
          same. Telling the persona "no markdown" would fight a habit the model
          keeps reaching for and throw away structure that is genuinely there.
        */}
        <RichText text={shown} style={[styles.text, mine ? styles.textMine : null]} />
      </View>
      <View style={styles.meta}>
        <Text style={styles.time}>{`${mine ? 'You' : 'Jarvis'} · ${clock(entry.at)}`}</Text>
        {/*
          What became of your own turn, and nothing at all for a settled one. The
          rules are in `lib/turnMark.ts`; the short version is that a mark on every
          message is noise you stop reading, and then the one that matters is noise
          too.
        */}
        {mark ? (
          <Text
            testID={`turn-mark-${entry.at}`}
            style={[styles.mark, mark.tone === 'bad' ? styles.markBad : null]}
          >
            {mark.label}
          </Text>
        ) : null}
        {mark?.retry && onRetry ? (
          <Touchable
            testID={`turn-retry-${entry.at}`}
            accessibilityRole="button"
            accessibilityLabel={`Send again: ${plainText(entry.text)}`}
            hitSlop={10}
            onPress={() => onRetry(entry.text)}
          >
            <Text style={styles.retry}>SEND AGAIN</Text>
          </Touchable>
        ) : null}
      </View>
    </Touchable>
  );
}

/**
 * A rule with the day's name in it, between one day's turns and the next.
 *
 * A line rather than a floating label: the point is to say the conversation
 * stopped and started again, and a rule is what a break looks like.
 */
function DayRule({ at }: { at: number }) {
  return (
    <View style={styles.dayRule} testID={`chat-day-${dayOf(at)}`}>
      <View style={styles.dayLine} />
      <Text style={styles.dayLabel}>{dayHeading(at)}</Text>
      <View style={styles.dayLine} />
    </View>
  );
}

/** three dots while the desk is working, so a slow answer never looks dropped */
function Typing({ accent }: { accent: string }) {
  return (
    <View testID="chat-typing" style={[styles.turn, styles.turnTheirs]}>
      <View style={[styles.bubble, styles.bubbleTheirs, styles.typing]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.typingDot, { backgroundColor: accent, opacity: 0.4 + i * 0.25 }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // sits at the visual top of the inverted list, small enough to read as a way back
  // rather than as an action somebody is being asked to take
  // a Pressable has no feedback of its own, and this one is deliberately not a
  // Touchable so that it can be driven from a laptop like every other control added
  // since 2026-08-26
  pressed: { opacity: 0.5 },
  earlier: { alignSelf: 'center', paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg },
  earlierText: { ...TYPE.meta, fontSize: 11, letterSpacing: 1, color: COLOR.dim },
  root: { flex: 1, backgroundColor: COLOR.bg },
  fill: { flex: 1 },
  head: { paddingHorizontal: SPACE.lg },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.lg, gap: SPACE.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, justifyContent: 'center' },
  chip: {
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    backgroundColor: COLOR.blueDim,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  chipText: { ...TYPE.dataLabel, fontSize: 11, color: COLOR.white },
  listBody: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md },
  turn: { marginBottom: SPACE.md, maxWidth: '86%' },
  turnMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  turnTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  bubbleTheirs: { backgroundColor: COLOR.panel, borderColor: COLOR.line },
  text: { ...TYPE.meta, fontSize: 13, lineHeight: 20, color: COLOR.white },
  draft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingBottom: SPACE.sm,
  },
  draftImage: { width: 76, height: 76, borderRadius: RADIUS.sm, backgroundColor: COLOR.blueDim },
  draftSide: { flex: 1, gap: SPACE.sm, alignItems: 'flex-start' },
  draftHint: { ...TYPE.meta, fontSize: 11, color: COLOR.dim },
  draftDiscard: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  draftDiscardText: { ...TYPE.dataLabel, fontSize: 9, color: COLOR.dim, letterSpacing: 1 },
  // 4:3 at the bubble's width, which is what the camera hands back. A square crop
  // would cut the thing being asked about out of half the photos taken sideways.
  sent: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: RADIUS.sm,
    marginBottom: SPACE.sm,
    backgroundColor: COLOR.blueDim,
  },
  textMine: { color: COLOR.white },
  // the row carries the margin now that the clock has company beside it
  meta: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: 4 },
  time: { ...TYPE.dataLabel, fontSize: 9, color: COLOR.dim, letterSpacing: 1 },
  // the accent, because it is the one line on this screen nobody asked for and it
  // has to be distinguishable from the situation line it sits under
  mark: { ...TYPE.dataLabel, fontSize: 9, color: COLOR.dim, letterSpacing: 1 },
  markBad: { color: COLOR.red },
  retry: { ...TYPE.dataLabel, fontSize: 9, color: COLOR.blue, letterSpacing: 1 },
  menuShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: SPACE.xl },
  menuFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.72)' },
  menu: {
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    overflow: 'hidden',
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.lg },
  menuText: { ...TYPE.meta, fontSize: 14, color: COLOR.white },
  menuTextBad: { color: COLOR.red },
  dayRule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    alignSelf: 'stretch',
    marginTop: SPACE.lg,
    marginBottom: SPACE.md,
  },
  dayLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLOR.line },
  dayLabel: { ...TYPE.dataLabel, fontSize: 10, color: COLOR.dim, letterSpacing: 1.5 },
  typing: { flexDirection: 'row', gap: 5, paddingVertical: SPACE.md + 2 },
  typingDot: { width: 6, height: 6, borderRadius: 3 },
  composer: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm },
});
