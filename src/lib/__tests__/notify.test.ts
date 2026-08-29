import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  WATCH_CHANNEL,
  GENERAL_CHANNEL,
  alertFromData,
  installHandler,
  postNow,
  prepare,
  shouldNotifyReply,
  replyFromData,
} from '../notify';

// the factory may not close over anything out of scope, so the handles are
// pulled back off the mocked module below
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  deleteNotificationChannelAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  dismissNotificationAsync: jest.fn(),
  AndroidImportance: { MAX: 5, DEFAULT: 3 },
}));

jest.mock('expo-constants', () => ({ expoConfig: null, easConfig: null }));

const schedule = Notifications.scheduleNotificationAsync as unknown as jest.Mock;
const setChannel = Notifications.setNotificationChannelAsync as unknown as jest.Mock;
const deleteChannel = Notifications.deleteNotificationChannelAsync as unknown as jest.Mock;
const getPermissions = Notifications.getPermissionsAsync as unknown as jest.Mock;

/**
 * `jest-expo` runs one platform (iOS), and channels are an Android concept — so
 * the platform has to be stated rather than assumed, or the assertions below
 * pass for the wrong reason.
 */
const asPlatform = (os: 'android' | 'ios') =>
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });

const realOS = Platform.OS;

beforeEach(() => {
  schedule.mockReset();
  schedule.mockResolvedValue('note-id');
  setChannel.mockReset();
  setChannel.mockResolvedValue(null);
  deleteChannel.mockReset();
  deleteChannel.mockResolvedValue(undefined);
  getPermissions.mockReset();
  getPermissions.mockResolvedValue({ granted: true });
  asPlatform('android');
});

/** the options `prepare()` passed for one channel id, or undefined if it never made it */
const channelArgs = (id: string) =>
  setChannel.mock.calls.find((c) => c[0] === id)?.[1] as Record<string, unknown> | undefined;

afterAll(() => asPlatform(realOS as 'android' | 'ios'));

describe('alertFromData', () => {
  const NOW = 1_700_000_000_000;
  const payload = (over: Record<string, unknown> = {}) => ({
    kind: 'intruder',
    id: 'a1',
    expires_at_ms: NOW + 24_000,
    image: '/shot.jpg',
    user: 'KAUSTAV',
    trigger: 'wake',
    ...over,
  });

  it('rebuilds the alert a sleeping phone never received', () => {
    // the socket cannot reach a suspended app, so the push carries the alert and
    // this is what turns it back into the frame the reducer expects
    expect(alertFromData(payload(), NOW)).toEqual({
      id: 'a1',
      expiresIn: 24,
      image: '/shot.jpg',
      user: 'KAUSTAV',
      trigger: 'wake',
    });
  });

  it('refuses an alert whose window has already closed', () => {
    // the desk locked itself long ago; a live countdown here would be a lie about
    // a machine that is already shut
    expect(alertFromData(payload({ expires_at_ms: NOW - 1000 }), NOW)).toBeNull();
    expect(alertFromData(payload({ expires_at_ms: NOW }), NOW)).toBeNull();
  });

  it('refuses anything it could not answer or was not sent', () => {
    expect(alertFromData(payload({ id: '' }), NOW)).toBeNull();
    expect(alertFromData(payload({ expires_at_ms: null }), NOW)).toBeNull();
    expect(alertFromData({ kind: 'desk_link' }, NOW)).toBeNull();
    expect(alertFromData(null, NOW)).toBeNull();
    expect(alertFromData('intruder', NOW)).toBeNull();
  });

  it('falls back to unlock rather than inventing a trigger', () => {
    const a = alertFromData(payload({ trigger: undefined, image: '', user: '' }), NOW);
    expect(a).toEqual({ id: 'a1', expiresIn: 24, image: null, user: null, trigger: 'unlock' });
  });
});

describe('installHandler, and what is allowed to make noise', () => {
  /** the behaviour the handler answers with for one notification's `data` */
  const behaviourFor = async (data: unknown) => {
    installHandler();
    const setHandler = Notifications.setNotificationHandler as unknown as jest.Mock;
    const { handleNotification } = setHandler.mock.calls.at(-1)![0];
    return handleNotification({ request: { content: { data } } });
  };

  /**
   * The bug this exists to prevent.
   *
   * `shouldPlaySound` is the vibration switch too — the native builder reads this
   * one field for both, then calls `setSilent(true)` when neither is wanted. So a
   * blanket `false` silenced the preview, the single notification whose entire
   * purpose is to be heard, and three sessions were spent rebuilding the general
   * channel to explain the silence.
   */
  it('lets a preview be heard, since being heard is the whole point of one', async () => {
    await expect(behaviourFor({ kind: 'commute', preview: true })).resolves.toMatchObject({
      shouldPlaySound: true,
    });
  });

  // the ordinary case, and the reason the blanket false looked right: the app is
  // already answering on screen with its own toast and haptic
  it('stays quiet for a notification the open app is already showing', async () => {
    await expect(behaviourFor({ kind: 'commute' })).resolves.toMatchObject({
      shouldPlaySound: false,
    });
  });

  // the handler must answer within 3 seconds or the notification is dropped, so
  // it may not throw on a payload it did not expect
  it('survives a notification carrying no data at all', async () => {
    await expect(behaviourFor(undefined)).resolves.toMatchObject({ shouldPlaySound: false });
    await expect(behaviourFor('not an object')).resolves.toMatchObject({ shouldPlaySound: false });
  });
});

describe('prepare, and the channels it creates', () => {
  /**
   * The bug this exists to prevent, and it has now bitten twice.
   *
   * `sound: 'default'` reads as the *system* default only in older
   * expo-notifications. In 57 any string is a custom filename looked up in the
   * config plugin's `sounds` array, so the call logged "Custom sound 'default'
   * not found in native app" and Expo gave up before applying audio attributes.
   * On device that left `general-v2` with `mAudioAttributes=null` — the one
   * channel on the phone missing them — which is the same silence the v2 rename
   * was supposed to cure.
   *
   * `desk-watch-v2` names no sound and is the only channel here ever proved
   * audible on hardware. So: no `sound` key, on either.
   */
  it('names no sound, because a named one is read as a file that is not there', async () => {
    await prepare();
    expect(channelArgs(GENERAL_CHANNEL)).toBeDefined();
    expect(channelArgs(GENERAL_CHANNEL)).not.toHaveProperty('sound');
    expect(channelArgs(WATCH_CHANNEL)).not.toHaveProperty('sound');
  });

  // a channel still has to be told to buzz; a bare importance leaves the pattern
  // null and Android honours that, which is what made `general` mute originally.
  // The pattern was picked by feel on the device across several attempts: 220ms
  // was barely there, the platform default a beat slow, a quick double-tap light.
  // Uneven on purpose — equal pulses read as a repeat, 400 falling to 250 reads
  // as one gesture and is told from the watch by shape rather than by length
  it('asks the general channel for a buzz that can be felt', async () => {
    await prepare();
    expect(channelArgs(GENERAL_CHANNEL)).toMatchObject({
      enableVibrate: true,
      vibrationPattern: [0, 400, 100, 250],
    });
  });

  /**
   * The everyday buzz was tuned upward until it could be felt, and one attempt
   * along the way was the watch pattern with a pulse removed. This pins the margin
   * that survived: the watch must stay strictly longer and higher-importance,
   * because through a pocket the weight is what says which of the two arrived.
   */
  it('keeps the watch alert heavier than an everyday one', async () => {
    await prepare();
    expect(channelArgs(WATCH_CHANNEL)).toMatchObject({
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      importance: 5,
    });
    const watch = channelArgs(WATCH_CHANNEL)!.vibrationPattern as number[];
    const general = channelArgs(GENERAL_CHANNEL)!.vibrationPattern as number[];
    const buzzTime = (p: number[]) => p.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0);
    expect(buzzTime(watch)).toBeGreaterThan(buzzTime(general));
  });

  /**
   * Android freezes importance, vibration and sound at creation, so none of the
   * superseded general channels can be repaired by an edit — only escaped by a
   * new id. `general` was silent and `general-v2` was created malformed; both
   * reached a pushed build, so both are deleted here to stop them appearing in the
   * user's notification settings as rows nothing posts to. `general-v7` never
   * shipped but was left stranded on the test phone by the change that superseded
   * it, which is the case that says an unshipped id still has to be cleaned once.
   *
   * The id is pinned deliberately: changing how this channel feels without
   * bumping it is a change no phone that already ran the app would ever see, and
   * that failure is invisible from the desk.
   */
  it('escapes every shipped general channel rather than editing one', async () => {
    await prepare();
    expect(GENERAL_CHANNEL).toBe('general-v8');
    const deleted = deleteChannel.mock.calls.map((c) => c[0]);
    expect(deleted).toEqual(expect.arrayContaining(['general', 'general-v2', 'general-v7']));
    expect(deleted).not.toContain(GENERAL_CHANNEL);
  });
});

describe('postNow', () => {
  it('names the channel on the trigger, where Android actually reads it', async () => {
    // It used to be spread into `content`, which has no such field — so every
    // notification landed on Expo's fallback channel: SILENT, no vibration.
    // On device the record read
    // `channel=expo_notifications_fallback_notification_channel`, which meant a
    // desk-watch alert on a MAX-importance channel arrived making no sound at
    // all. `tsc` cannot catch it, because the spread that added it turns off
    // excess-property checking — so this test is the guard.
    await postNow({ title: 'Someone at the desk', body: 'Was this you?', channel: WATCH_CHANNEL });

    const arg = schedule.mock.calls[0][0];
    expect(arg.trigger).toEqual({ channelId: WATCH_CHANNEL });
    expect(arg.content).not.toHaveProperty('channelId');
  });

  it('falls back to the general channel rather than to no channel at all', async () => {
    await postNow({ title: 'J.A.R.V.I.S. is on full power', body: 'The desk is online.' });
    expect(schedule.mock.calls[0][0].trigger).toEqual({ channelId: GENERAL_CHANNEL });
  });

  it('sends no channel on iOS, which has no such concept', async () => {
    asPlatform('ios');
    await postNow({ title: 'x', body: 'y', channel: WATCH_CHANNEL });
    expect(schedule.mock.calls[0][0].trigger).toBeNull();
  });

  it('returns null instead of throwing when the native module is absent', async () => {
    // an older dev build has no module at all; a notification that cannot be
    // posted must not take down whatever was trying to post it
    schedule.mockRejectedValueOnce(new Error('no native module'));
    await expect(postNow({ title: 'x', body: 'y' })).resolves.toBeNull();
  });
});

/**
 * Whether a reply earns a system notification.
 *
 * Two bugs met in the one condition this replaces. It read
 * `if (first || chatFocused.current || simulated) return;`:
 *
 * 1. **A reply arriving while the app is open on another tab buzzed.** Reported as
 *    "going to the pages except chat page a notification arrives — that isn't
 *    normal". It was working as written: `chatFocused` was the only guard, so
 *    leaving the Chat tab mid-answer made the reply "unwatched". But the app is on
 *    screen and answering; the unread badge is the right signal, not a buzz.
 *
 * 2. **A reply arriving while the app was closed did NOT buzz** — the actual
 *    complaint. React Navigation's blur does not fire when the app is
 *    backgrounded, so `chatFocused` stays `true` for the Chat tab. Ask a question
 *    from Chat, background the app, and the one guard meant to suppress noise
 *    suppressed the notification instead. Which is exactly how anyone asks a
 *    question.
 *
 * So focus is not the question — whether the app is on screen at all is. And with
 * that, `chatFocused` stops being part of this decision entirely.
 */
describe('shouldNotifyReply', () => {
  it('notifies when the app is not on screen, which is the whole point of one', () => {
    expect(shouldNotifyReply({ appActive: false, simulated: false })).toBe(true);
  });

  it('stays quiet while the app is open, because the tab badge already says so', () => {
    expect(shouldNotifyReply({ appActive: true, simulated: false })).toBe(false);
  });

  it('notifies a backgrounded app even though Chat was the tab left open', () => {
    // the regression this exists to prevent: blur never fired, so the old guard
    // read "you are watching this" about a phone in a pocket
    expect(shouldNotifyReply({ appActive: false, simulated: false })).toBe(true);
  });

  it('never notifies for the stand-in desk, whose replies are scripted', () => {
    expect(shouldNotifyReply({ appActive: false, simulated: true })).toBe(false);
  });
});

/**
 * The gateway pushes `{"kind": "reply"}` with the answer when it cannot reach
 * the phone over the socket — which, since the app closes its socket on
 * background, is every turn started and then pocketed. Nothing consumed those,
 * so the answer appeared in the shade and never entered the conversation.
 */
describe('a reply that arrived as a push', () => {
  it('is read out of the notification body', () => {
    expect(replyFromData({ kind: 'reply' }, 'The office is a 24 minute drive, sir.')).toEqual({
      text: 'The office is a 24 minute drive, sir.',
    });
  });

  it('ignores the notification this app raised for itself', () => {
    // that text is already in the chat log; feeding it back would be an echo
    expect(replyFromData({ kind: 'reply', local: true }, 'already said')).toBeNull();
  });

  it('ignores anything that is not a reply', () => {
    expect(replyFromData({ kind: 'intruder', id: 'x' }, 'someone is at your desk')).toBeNull();
    expect(replyFromData(null, 'body')).toBeNull();
  });

  it('ignores a reply with no body, rather than adding an empty turn', () => {
    expect(replyFromData({ kind: 'reply' }, '   ')).toBeNull();
    expect(replyFromData({ kind: 'reply' }, undefined)).toBeNull();
  });

  /**
   * A spoken turn is two frames, and only the second one has a push path.
   *
   * Proved on the device on 2026-08-27: ask by voice, pocket the phone, and the
   * transcript meets a dead socket while the answer is pushed — so the chat
   * gained an answer with no question above it, which reads as J.A.R.V.I.S.
   * having volunteered it. The gateway cannot write his turn itself: a
   * transcript sent as a notification of its own would be filed as the machine
   * speaking. It rides on the reply instead, and this is the half that reads it
   * — an unknown field on the push is dropped in silence, which is exactly how
   * the gateway change would have looked like it did nothing.
   */
  it('carries the question he asked, when the socket lost it', () => {
    expect(
      replyFromData({ kind: 'reply', transcript: 'how far is home' }, 'Twenty four minutes, sir.')
    ).toEqual({ text: 'Twenty four minutes, sir.', transcript: 'how far is home' });
  });

  it('leaves the field off entirely when the transcript did reach the socket', () => {
    // the ordinary case: the phone already logged his turn, and a second copy
    // would be him appearing to have asked twice
    expect(replyFromData({ kind: 'reply' }, 'Twenty four minutes, sir.')).toEqual({
      text: 'Twenty four minutes, sir.',
    });
  });

  it('ignores a blank or non-string transcript rather than logging an empty turn', () => {
    expect(replyFromData({ kind: 'reply', transcript: '   ' }, 'said')).toEqual({ text: 'said' });
    expect(replyFromData({ kind: 'reply', transcript: 7 }, 'said')).toEqual({ text: 'said' });
  });

  it('ignores a transcript on a briefing, which had no question above it', () => {
    // the commute push is not an answer to anything; a transcript there would
    // invent a turn he never took
    expect(
      replyFromData({ kind: 'commute', transcript: 'never said this' }, 'An umbrella, then.')
    ).toEqual({ text: 'An umbrella, then.' });
  });
});

/**
 * The departure briefing is pushed with `{"kind": "commute"}`, and until now
 * nothing on the phone consumed it: `replyFromData` returned null for every kind
 * but `reply`, so a briefing was shown in the shade and never entered the log.
 * Reported from the device on 2026-08-21 — the 8 AM briefing arrived and the
 * Activity panel was empty, which reads as the panel being broken.
 */
describe('a departure briefing that arrived as a push', () => {
  it('is taken in, so the panel can show what was said', () => {
    expect(
      replyFromData({ kind: 'commute', placeId: 'home' }, 'An umbrella, then. (8 AM–11 AM)', {
        title: 'Before you leave Home, sir',
      })
    ).toEqual({ text: 'Before you leave Home, sir\nAn umbrella, then. (8 AM–11 AM)' });
  });

  it('keeps the title, which names the door the briefing is about', () => {
    // two of these arrive in a day and the bodies can be identical; the title is
    // the only part that says which departure it was
    const taken = replyFromData({ kind: 'commute', placeId: 'office' }, 'Nothing to carry.', {
      title: 'Nothing in your way from Office, sir',
    });
    expect(taken?.text.startsWith('Nothing in your way from Office, sir')).toBe(true);
  });

  it('carries the time the notification arrived, not the time it was read', () => {
    // swept out of the tray hours later: stamping it `now` would file this
    // morning's briefing under lunchtime and put it above things that came after
    const taken = replyFromData({ kind: 'commute' }, 'An umbrella, then.', {
      title: 'Before you leave Home, sir',
      at: 1_755_000_000_000,
    });
    expect(taken?.at).toBe(1_755_000_000_000);
  });

  it('still refuses a briefing with no body, rather than posting a bare title', () => {
    expect(replyFromData({ kind: 'commute' }, '  ', { title: 'Before you leave Home, sir' })).toBeNull();
  });
});
