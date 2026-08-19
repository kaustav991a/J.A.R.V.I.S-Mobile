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

jest.mock('../../link/useLink', () => ({
  useLink: () => ({
    mode: 'offline',
    status: 'closed',
    lastError: null,
    send: mockSend,
    sendVoice: jest.fn(() => false),
    reprobe: jest.fn(),
    disconnect: jest.fn(),
  }),
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
  postNow: jest.fn().mockResolvedValue(undefined),
  registerForPush: jest.fn().mockResolvedValue(null),
  shouldNotifyReply: jest.fn(() => false),
}));

jest.mock('../../lib/haptics', () => ({ haptic: { good: jest.fn() } }));

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
