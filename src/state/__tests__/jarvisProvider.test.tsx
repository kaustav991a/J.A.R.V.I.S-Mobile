import { AppState, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
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
/** the provider's own onFrame, captured so a test can land a frame on it */
const mockFrames: { onFrame: ((f: unknown, at: number) => void) | null } = { onFrame: null };
/** the provider's pushed-reply handler, captured so a test can deliver one */
const mockPush: { take: ((r: { text: string }) => void) | null } = { take: null };

jest.mock('../../link/useLink', () => ({
  useLink: (opts: { onFrame: (f: unknown, at: number) => void }) => {
    mockFrames.onFrame = opts.onFrame;
    return {
      mode: 'offline',
      status: 'closed',
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
    registerPush: jest.fn().mockResolvedValue(undefined),
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
  onPushReply: (cb: (r: { text: string }) => void) => {
    mockPush.take = cb;
    return jest.fn();
  },
  replyFromLaunch: jest.fn().mockResolvedValue(null),
  postNow: jest.fn().mockResolvedValue(undefined),
  registerForPush: jest.fn().mockResolvedValue(null),
  shouldNotifyReply: jest.fn(() => false),
}));

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
function Probe({ say }: { say: string }) {
  const { hud, sendCommand } = useJarvis();
  return (
    <>
      <Text testID="log">{hud.chat.map((c) => `${c.from}: ${c.text}`).join('\n')}</Text>
      <Text testID="go" onPress={() => void sendCommand(say).catch(() => {})}>
        send
      </Text>
    </>
  );
}

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
  return () => view.getByTestId('log').props.children as string;
};

beforeEach(() => {
  mockSend.mockReset();
  mockBackdoor.mockReset();
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
    view.unmount();
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
      mockPush.take?.({ text: 'A 24 minute drive, sir.' });
    });
    expect(view.getByTestId('log').props.children).toContain('jarvis: A 24 minute drive, sir.');
    view.unmount();
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
      mockPush.take?.({ text: 'Twice, sir.' });
      mockPush.take?.({ text: 'Twice, sir.' });
    });
    const log = view.getByTestId('log').props.children as string;
    expect(log.split('Twice, sir.').length - 1).toBe(1);
    view.unmount();
  });
});
