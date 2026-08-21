import { AppState, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { JarvisProvider, useJarvis } from '../JarvisProvider';

/**
 * What happens to a message that cannot be delivered.
 *
 * The socket is the fast path and REST is the fallback, and when BOTH are gone
 * the turn used to disappear without a word: `sendCommand` rejected, all four
 * call sites swallow the rejection with `.catch(() => {})`, and the local echo
 * was already in the log. So the chat showed the question, exactly as it does
 * while J.A.R.V.I.S. is thinking, and nothing ever arrived — with no way to tell
 * the two apart.
 */

const mockSend = jest.fn();
const mockBackdoor = jest.fn();
const mockRegisterPush = jest.fn().mockResolvedValue(undefined);
const mockSyncCommute = jest.fn().mockResolvedValue(undefined);
const mockOpenChat = jest.fn();
/** the link state the provider sees; cloud+open is what push registration needs */
const mockLink = { mode: 'offline', status: 'closed' };
/** the provider's own onFrame, captured so a test can land a frame on it */
const mockFrames: { onFrame: ((f: unknown, at: number) => void) | null } = { onFrame: null };
/** the provider's pushed-reply handler, captured so a test can deliver one */
const mockPush: { take: ((r: { text: string }, tapped: boolean) => void) | null } = { take: null };

jest.mock('../../link/useLink', () => ({
  useLink: (opts: { onFrame: (f: unknown, at: number) => void }) => {
    mockFrames.onFrame = opts.onFrame;
    return {
      mode: mockLink.mode,
      status: mockLink.status,
      lastError: null,
      send: mockSend,
      sendVoice: jest.fn(() => false),
      reprobe: jest.fn(),
      disconnect: jest.fn(),
    };
  },
}));

jest.mock('../../api/client', () => ({
  createApi: () => ({
    backdoor: mockBackdoor,
    pending: jest.fn().mockResolvedValue({}),
    confirm: jest.fn().mockResolvedValue(undefined),
    answerWatch: jest.fn().mockResolvedValue(undefined),
    tasks: jest.fn().mockResolvedValue({}),
    presence: jest.fn().mockResolvedValue({}),
    registerPush: mockRegisterPush,
    syncCommute: mockSyncCommute,
  }),
}));

jest.mock('../../lib/notify', () => ({
  WATCH_CATEGORY: 'watch',
  WATCH_CHANNEL: 'watch',
  GENERAL_CHANNEL: 'general',
  alertFromLaunch: jest.fn().mockResolvedValue(null),
  dismiss: jest.fn().mockResolvedValue(undefined),
  // returns the unsubscribe itself, not a subscription object — the effect calls it
  onAlertTapped: jest.fn(() => jest.fn()),
  pendingReplies: jest.fn().mockResolvedValue([]),
  onPushReply: (cb: (r: { text: string }, tapped: boolean) => void) => {
    mockPush.take = cb;
    return jest.fn();
  },
  replyFromLaunch: jest.fn().mockResolvedValue(null),
  postNow: jest.fn().mockResolvedValue(undefined),
  registerForPush: jest.fn().mockResolvedValue('ExponentPushToken[test]'),
  shouldNotifyReply: jest.fn(() => false),
}));

// lazily, because the factory runs when JarvisProvider is imported — before the
// const above it has initialised
jest.mock('../../navigation/RootNavigator', () => ({ openChat: () => mockOpenChat() }));

jest.mock('../../lib/haptics', () => ({ haptic: { good: jest.fn() } }));

jest.mock('../../lib/journal/rollup', () => ({
  usageForAsk: async () => ({ today: 42, pickups: 7, top: ['Gmail'], usual: 60, days: 3 }),
}));

jest.mock('../chatStore', () => ({
  loadChat: jest.fn().mockResolvedValue([]),
  saveChat: jest.fn().mockResolvedValue(undefined),
  clearChat: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../lib/place', () => ({
  FIX_TTL_MS: 60000,
  askForLocation: jest.fn().mockResolvedValue(false),
  currentFix: jest.fn().mockResolvedValue(null),
  forgetTrail: jest.fn().mockResolvedValue(undefined),
  loadShareLocation: jest.fn().mockResolvedValue(false),
  loadTrail: jest.fn().mockResolvedValue([]),
  rememberPlace: jest.fn().mockResolvedValue(undefined),
  saveShareLocation: jest.fn().mockResolvedValue(undefined),
  weatherFor: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../lib/knownPlaces', () => ({
  loadKnown: jest.fn().mockResolvedValue([]),
  nameFor: jest.fn(() => null),
}));

/** the whole chat log, one line per turn, so assertions read like the screen */
function Probe({ say, read }: { say: string; read?: string }) {
  const { hud, sendCommand, alertsUnread, markRead, readIds } = useJarvis();
  return (
    <>
      <Text testID="log">{hud.chat.map((c) => `${c.from}: ${c.text}`).join('\n')}</Text>
      {/* the arrival times, so a swept briefing can be shown to keep its own */}
      <Text testID="times">{hud.chat.map((c) => String(c.at)).join(',')}</Text>
      <Text testID="unread">{String(alertsUnread)}</Text>
      <Text testID="read-ids">{[...readIds].sort().join(',')}</Text>
      <Text testID="read-one" onPress={() => markRead(read ?? '')}>
        read
      </Text>
      <Text testID="go" onPress={() => void sendCommand(say).catch(() => {})}>
        send
      </Text>
    </>
  );
}

/**
 * Send one thing, let it settle, and take the log away as a string.
 *
 * **The unmount at the end is load-bearing.** This helper used to leave its
 * provider mounted, and the provider has several effects that resolve on their own
 * schedule — the stored chat, the endpoints, the read set. Those landed after the
 * test that started them had finished, outside any `act`, and React said so:
 *
 *     You seem to have overlapping act() calls, this is not supported.
 *     The current testing environment is not configured to support act(...)
 *
 * After enough of those the act environment is corrupted, and every later `render`
 * in the file returns an **empty tree** — no error, no warning, just a query that
 * cannot find anything. It reads exactly like a component that failed to mount, and
 * it cost three tests today before the console was read properly.
 *
 * So the log is snapshotted while the tree is alive and the getter serves the
 * snapshot. Every caller only ever asserts on the settled state anyway.
 */
/**
 * Let the provider finish what it started, then take the tree down.
 *
 * **Both halves are needed and the order matters.** The provider has effects that
 * resolve on their own schedule — the stored chat, the endpoints, the read set. If
 * one of them resolves after the test body has finished, its `setState` is
 * processed outside any `act`, and React says so:
 *
 *     The current testing environment is not configured to support act(...)
 *
 * Enough of those and the act environment is corrupted, after which every `render`
 * in this file returns an **empty tree** — no throw, no warning, just queries that
 * find nothing. That cost four tests before the console was read properly.
 *
 * An `afterEach` cannot do this: RNTL registers its own cleanup at import time, so
 * it unmounts before any hook this file adds. The flush has to happen inside the
 * test body, which is what this is for.
 */
const finish = async (view: { unmount: () => void }) => {
  // one empty act, deliberately: it drains React's pending queue without giving
  // the provider's promise chains another turn to re-arm themselves. Awaiting a
  // microtask inside here instead ran the suite out of heap.
  await act(async () => {});
  view.unmount();
};

const sendAndSettle = async (text: string) => {
  // RNTL 14 renders asynchronously; every other suite in this repo awaits it too
  const view = await render(
    <JarvisProvider>
      <Probe say={text} />
    </JarvisProvider>
  );
  await act(async () => {
    fireEvent.press(view.getByTestId('go'));
  });
  const log = view.getByTestId('log').props.children as string;
  await finish(view);
  return () => log;
};

beforeEach(async () => {
  // the read set is on disk now, so without this a mark left by one test arrives
  // as history in the next — which is exactly what it is for, and exactly what a
  // test must not inherit
  await AsyncStorage.clear();
  mockSend.mockReset();
  mockBackdoor.mockReset();
  mockSyncCommute.mockReset();
  mockSyncCommute.mockResolvedValue(undefined);
  mockLink.mode = 'offline';
  mockLink.status = 'closed';
  // a real AppState emits on its own schedule, and the provider reads
  // `currentState` during render to know whether a reply should notify
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
});

describe('sendCommand when nothing can carry the message', () => {
  it('says so in the chat rather than leaving the question hanging', async () => {
    mockSend.mockReturnValue(false);
    mockBackdoor.mockRejectedValue(new Error('Network request failed'));

    const log = await sendAndSettle('lock the desk');

    expect(log()).toContain('user: lock the desk');
    // the point of the whole fix: something came back
    expect(log()).toMatch(/jarvis: .+/);
  });

  it('names the failure flatly, with no wit attached to it', async () => {
    // the same rule the `unavailable` briefing follows: a remark on a line whose
    // job is admitting something did not happen reads as though it did
    mockSend.mockReturnValue(false);
    mockBackdoor.mockRejectedValue(new Error('Network request failed'));

    const log = await sendAndSettle('lock the desk');

    const reply = log().split('\n').find((l) => l.startsWith('jarvis: ')) ?? '';
    expect(reply).toContain('did not');
    expect(reply).not.toContain('!');
  });

  it('stays quiet when the socket took it, because nothing failed', async () => {
    mockSend.mockReturnValue(true);

    const log = await sendAndSettle('lock the desk');

    expect(log()).toBe('user: lock the desk');
    expect(mockBackdoor).not.toHaveBeenCalled();
  });

  it('stays quiet when REST took it after the socket was down', async () => {
    mockSend.mockReturnValue(false);
    mockBackdoor.mockResolvedValue({});

    const log = await sendAndSettle('lock the desk');

    expect(log()).toBe('user: lock the desk');
    expect(mockBackdoor).toHaveBeenCalledWith('lock the desk');
  });
});

/**
 * The desk watch, while the app is open.
 *
 * `installHandler` answers `shouldPlaySound: false` for any notification that has
 * not opted in, and on Android that flag is the vibration switch as well. The one
 * notification in this app carrying a 30-second lock deadline had not opted in, so
 * with the app foregrounded it landed in total silence. The alert screen takes
 * over the display, which serves a phone being looked at and does nothing for one
 * lying face down.
 */
describe('the desk-watch notification', () => {
  it('opts into being heard, even with the app open', async () => {
    const { postNow } = jest.requireMock('../../lib/notify') as { postNow: jest.Mock };
    postNow.mockClear();

    const view = await render(
      <JarvisProvider>
        <Probe say="unused" />
      </JarvisProvider>
    );
    await act(async () => {
      mockFrames.onFrame?.(
        { kind: 'intruder', id: 'i-9', expiresIn: 30, image: null, user: 'KAUSTAV', trigger: 'wake' },
        Date.now()
      );
    });

    const posted = postNow.mock.calls.map(([o]) => o).find((o) => o?.data?.kind === 'intruder');
    expect(posted).toBeDefined();
    expect(posted.data.alertWhenOpen).toBe(true);
    await finish(view);
  });
});

/**
 * How the phone has been used travels with the question, like the clock and the
 * named places already do — a summary, never rows.
 */
describe('what a question carries', () => {
  it('takes today usage with it, so an ordinary reply is already informed', async () => {
    mockSend.mockReturnValue(true);
    await sendAndSettle('am I on my phone too much');

    const payload = JSON.parse(mockSend.mock.calls[0][0] as string);
    expect(payload.usage).toEqual({ today: 42, pickups: 7, top: ['Gmail'], usual: 60, days: 3 });
    // and the question itself is still the question
    expect(payload.text).toBe('am I on my phone too much');
  });
});

/**
 * Reported from the device: send a message, background the app, and the answer
 * arrives as a notification — but the chat comes back holding the question, no
 * answer under it, and a typing indicator still going.
 *
 * The gateway had been pushing the reply all along. Nothing on this side
 * consumed it.
 */
describe('a reply that arrives as a push', () => {
  it('lands in the conversation, not only in the notification shade', async () => {
    const view = await render(
      <JarvisProvider>
        <Probe say="unused" />
      </JarvisProvider>
    );
    await act(async () => {
      mockPush.take?.({ text: 'A 24 minute drive, sir.' }, false);
    });
    expect(view.getByTestId('log').props.children).toContain('jarvis: A 24 minute drive, sir.');
    await finish(view);
  });

  it('does not say the same thing twice when the socket delivers it as well', async () => {
    // the answer can arrive pushed and then again down a socket that reopened
    // underneath it; the reducer's consecutive-duplicate guard is what collapses
    // that, and this pins that the push path goes through it
    const view = await render(
      <JarvisProvider>
        <Probe say="unused" />
      </JarvisProvider>
    );
    await act(async () => {
      mockPush.take?.({ text: 'Twice, sir.' }, false);
      mockPush.take?.({ text: 'Twice, sir.' }, false);
    });
    const log = view.getByTestId('log').props.children as string;
    expect(log.split('Twice, sir.').length - 1).toBe(1);
    await finish(view);
  });
});

/**
 * Android discards a push addressed to a channel it does not have, and this app
 * has renamed its everyday channel eight times chasing a mute-briefing bug —
 * `general` through `general-v8` — deleting each old one as it went. The gateway
 * went on addressing `general`, so every reply push in between was accepted by
 * Expo and thrown away by Android. Bug C survived three correct fixes to the
 * socket because of it.
 */
describe('registering for push', () => {
  it('tells the gateway what this phone calls its channels', async () => {
    mockRegisterPush.mockClear();
    mockLink.mode = 'cloud';
    mockLink.status = 'open';

    const view = await render(
      <JarvisProvider>
        <Probe say="unused" />
      </JarvisProvider>
    );
    await waitFor(() => expect(mockRegisterPush).toHaveBeenCalled());

    const [, , channels] = mockRegisterPush.mock.calls[0];
    expect(channels).toEqual({ general: 'general', watch: 'watch' });
    await finish(view);
  });
});

/**
 * Neither notification listener covers the ordinary case.
 *
 * `addNotificationReceivedListener` fires only while the app is FOREGROUNDED and
 * the response listener only when a notification is tapped — so asking
 * something, pocketing the phone, and coming back by tapping the app icon hit
 * neither. The answer was delivered, shown in the shade, and never entered the
 * conversation. Reported from the device AFTER the listener work that was meant
 * to fix exactly this.
 */
describe('coming back to a reply that arrived while away', () => {
  it('takes replies out of the shade on return, without being told', async () => {
    const notify = jest.requireMock('../../lib/notify') as { pendingReplies: jest.Mock };
    notify.pendingReplies.mockResolvedValue([{ text: 'Twenty four minutes, sir.' }]);

    const view = await render(
      <JarvisProvider>
        <Probe say="unused" />
      </JarvisProvider>
    );
    await waitFor(() =>
      expect(view.getByTestId('log').props.children).toContain('jarvis: Twenty four minutes, sir.')
    );
    notify.pendingReplies.mockResolvedValue([]);
    await finish(view);
  });

  it('files a swept briefing under the time it arrived, not the time it was read', async () => {
    // the 8 AM briefing is swept whenever the app is next opened, which can be
    // hours later. Stamping `now` filed it under lunchtime, above the things that
    // really did come after it, so the panel's order was a lie
    const notify = jest.requireMock('../../lib/notify') as { pendingReplies: jest.Mock };
    notify.pendingReplies.mockResolvedValue([
      { text: 'Before you leave Home, sir\nAn umbrella, then.', at: 1_755_000_000_000 },
    ]);

    const view = await render(
      <JarvisProvider>
        <Probe say="unused" />
      </JarvisProvider>
    );
    await waitFor(() => expect(view.getByTestId('log').props.children).toContain('An umbrella, then.'));
    expect(view.getByTestId('times').props.children).toContain('1755000000000');
    notify.pendingReplies.mockResolvedValue([]);
    await finish(view);
  });

  it('does not double up when the same one is swept twice', async () => {
    // the reducer's consecutive-duplicate guard is what absorbs this, and the
    // sweep runs on every return to the foreground
    const notify = jest.requireMock('../../lib/notify') as { pendingReplies: jest.Mock };
    notify.pendingReplies.mockResolvedValue([{ text: 'Once only, sir.' }, { text: 'Once only, sir.' }]);

    const view = await render(
      <JarvisProvider>
        <Probe say="unused" />
      </JarvisProvider>
    );
    await waitFor(() => expect(view.getByTestId('log').props.children).toContain('Once only, sir.'));
    const log = view.getByTestId('log').props.children as string;
    expect(log.split('Once only, sir.').length - 1).toBe(1);
    notify.pendingReplies.mockResolvedValue([]);
    await finish(view);
  });
});

/**
 * Tapping the answer is a request to see it. Landing on whatever tab happened to
 * be open, with the reply somewhere behind it, is the version that was reported.
 */
describe('tapping a reply notification', () => {
  it('opens the conversation', async () => {
    mockOpenChat.mockClear();
    const view = await render(
      <JarvisProvider>
        <Probe say="unused" />
      </JarvisProvider>
    );
    await act(async () => {
      mockPush.take?.({ text: 'Twenty minutes, sir.' }, true);
    });
    expect(mockOpenChat).toHaveBeenCalled();
    await finish(view);
  });

  it('stays put when one merely arrives', async () => {
    // pulling him out of the screen he chose would be the app deciding for him
    mockOpenChat.mockClear();
    const view = await render(
      <JarvisProvider>
        <Probe say="unused" />
      </JarvisProvider>
    );
    await act(async () => {
      mockPush.take?.({ text: 'No rush, sir.' }, false);
    });
    expect(mockOpenChat).not.toHaveBeenCalled();
    await finish(view);
  });
});

/**
 * Read and unread, per entry and across launches.
 *
 * The panel held one timestamp, baselined at mount, so "read" meant "older than
 * this launch": reading one entry said nothing about its neighbours and nothing
 * survived a restart. Reported from the device on 2026-08-21 along with the
 * missing briefings — a bell whose number resets to the whole log on every launch
 * is a number you stop reading.
 */
describe('what has been read', () => {
  it('does not call a restored log unread, which would open the bell at the whole history', async () => {
    const store = jest.requireMock('../chatStore') as { loadChat: jest.Mock };
    store.loadChat.mockResolvedValueOnce([
      { from: 'jarvis', text: 'Yesterday, sir.', at: 1_754_000_000_000 },
      { from: 'user', text: 'thanks', at: 1_754_000_000_001 },
    ]);

    const view = await render(
      <JarvisProvider>
        <Probe say="unused" />
      </JarvisProvider>
    );
    await waitFor(() => expect(view.getByTestId('log').props.children).toContain('Yesterday, sir.'));
    expect(view.getByTestId('unread').props.children).toBe('0');
    await finish(view);
  });

  it('counts a briefing swept out of the tray as unread, because it has not been looked at', async () => {
    const notify = jest.requireMock('../../lib/notify') as { pendingReplies: jest.Mock };
    notify.pendingReplies.mockResolvedValue([
      { text: 'Before you leave Home, sir\nAn umbrella, then.', at: 1_755_000_000_000 },
    ]);

    const view = await render(
      <JarvisProvider>
        <Probe say="unused" />
      </JarvisProvider>
    );
    await waitFor(() => expect(view.getByTestId('unread').props.children).toBe('1'));
    notify.pendingReplies.mockResolvedValue([]);
    await finish(view);
  });

  it('leaves the other entries alone when one is read', async () => {
    const notify = jest.requireMock('../../lib/notify') as { pendingReplies: jest.Mock };
    notify.pendingReplies.mockResolvedValue([
      { text: 'First, sir.', at: 1_755_000_000_000 },
      { text: 'Second, sir.', at: 1_755_000_000_001 },
    ]);

    const view = await render(
      <JarvisProvider>
        <Probe say="unused" read="jarvis-1755000000000" />
      </JarvisProvider>
    );
    await waitFor(() => expect(view.getByTestId('unread').props.children).toBe('2'));
    await act(async () => {
      fireEvent.press(view.getByTestId('read-one'));
    });
    expect(view.getByTestId('unread').props.children).toBe('1');
    notify.pendingReplies.mockResolvedValue([]);
    await finish(view);
  });

  it('still knows it was read after a relaunch', async () => {
    // the whole point of storing the set rather than a mount-time timestamp
    const notify = jest.requireMock('../../lib/notify') as { pendingReplies: jest.Mock };
    notify.pendingReplies.mockResolvedValue([{ text: 'Only one, sir.', at: 1_755_000_000_000 }]);

    const first = await render(
      <JarvisProvider>
        <Probe say="unused" read="jarvis-1755000000000" />
      </JarvisProvider>
    );
    await waitFor(() => expect(first.getByTestId('unread').props.children).toBe('1'));
    await act(async () => {
      fireEvent.press(first.getByTestId('read-one'));
    });
    await waitFor(() => expect(first.getByTestId('unread').props.children).toBe('0'));
    await finish(first);

    const again = await render(
      <JarvisProvider>
        <Probe say="unused" />
      </JarvisProvider>
    );
    await waitFor(() => expect(again.getByTestId('log').props.children).toContain('Only one, sir.'));
    expect(again.getByTestId('unread').props.children).toBe('0');
    notify.pendingReplies.mockResolvedValue([]);
    await finish(again);
  });
});

/**
 * OWED: the stamp written by `syncCommute`.
 *
 * `markCloudArmed` on a successful upload, and NOT on a failed one, is the wiring
 * that makes the phone's briefing task a fallback rather than a second sender. The
 * decision itself is covered in `lib/__tests__/commute.test.ts` ("whether the
 * gateway holds the schedule"); what is untested is this provider calling it.
 *
 * Two attempts failed for harness reasons rather than product ones: driving it
 * through the cloud-connect effect never fired `api.syncCommute` when the whole
 * file runs (it fires when the test runs alone), and driving it through a button on
 * `Probe` renders an empty tree at that point in the file. Both smell like state
 * left behind by the earlier tests that never unmount. Worth fixing once, in a
 * sitting of its own, because the same harness is what would let the task body be
 * tested at all — it has never been exercised by any test.
 */

/**
 * PARTLY FIXED FAULT in this file — read before adding a test that mounts.
 *
 * A provider effect resolving after its test body has finished does so outside any
 * `act`. Enough of those corrupt the act environment, after which every later
 * `render` here returns an **empty tree**: no throw, no warning, queries that find
 * nothing. It reads exactly like a component that failed to mount, and it has now
 * cost six tests.
 *
 * **What was tried, and what it bought (2026-08-21).**
 * - Unmounting every view: necessary, not sufficient.
 * - `finish()` below, one empty `act` before each unmount: five violations down to
 *   four, and the suite stays green.
 * - `await Promise.resolve()` inside that `act`: violations to **zero**, and the
 *   suite then ran the heap out — draining chained microtasks lets the provider
 *   re-arm its own effects without bound. Do not simply widen the flush.
 *
 * Four remain and they are still enough to blank a late render. The likely real fix
 * is making the provider's async effects cancellable at the source rather than
 * guarding inside each `.then`, which is a change to production code and wants its
 * own sitting.
 *
 * Until then: a new provider test that mounts and presses belongs in its own file.
 * See `capabilityIntercept.test.tsx` and `commuteStamp.test.tsx`.
 */
