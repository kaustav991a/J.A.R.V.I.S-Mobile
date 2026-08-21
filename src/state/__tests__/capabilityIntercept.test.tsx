import { Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { JarvisProvider, useJarvis } from '../JarvisProvider';

/**
 * "What can you do" is answered by the phone, not by the model.
 *
 * A model asked to list its own features always finds one, and a confidently
 * offered capability that does not exist sends someone hunting for it and then
 * reporting a bug against something that was never built. The list lives in
 * `lib/capabilities.ts` so it can only be wrong deliberately.
 *
 * **Its own file rather than a describe in `jarvisProvider.test.tsx`.** That file
 * has a pre-existing act-environment problem — a provider effect settling outside
 * `act` corrupts it, and every `render` after that returns an empty tree with no
 * error. A fresh module registry sidesteps it; the underlying fault is recorded at
 * the foot of that file.
 */

const mockSend = jest.fn();
const mockBackdoor = jest.fn();

jest.mock('../../link/useLink', () => ({
  useLink: () => ({
    mode: 'desk',
    status: 'open',
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
    syncCommute: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('../../lib/notify', () => ({
  WATCH_CATEGORY: 'watch',
  WATCH_CHANNEL: 'watch',
  GENERAL_CHANNEL: 'general',
  alertFromLaunch: jest.fn().mockResolvedValue(null),
  dismiss: jest.fn().mockResolvedValue(undefined),
  onAlertTapped: jest.fn(() => jest.fn()),
  pendingReplies: jest.fn().mockResolvedValue([]),
  onPushReply: jest.fn(() => jest.fn()),
  replyFromLaunch: jest.fn().mockResolvedValue(null),
  postNow: jest.fn().mockResolvedValue(undefined),
  registerForPush: jest.fn().mockResolvedValue('ExponentPushToken[test]'),
  shouldNotifyReply: jest.fn(() => false),
}));

jest.mock('../../navigation/RootNavigator', () => ({ openChat: jest.fn() }));
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

function Probe({ say }: { say: string }) {
  const { hud, sendCommand } = useJarvis();
  return (
    <>
      <Text testID="log">{hud.chat.map((c) => `${c.from}: ${c.text}`).join('\n')}</Text>
      <Text testID="states">{hud.chat.map((c) => String(c.state)).join(",")}</Text>
      <Text testID="go" onPress={() => void sendCommand(say).catch(() => {})}>
        send
      </Text>
    </>
  );
}

const ask = async (text: string) => {
  const view = await render(
    <JarvisProvider>
      <Probe say={text} />
    </JarvisProvider>
  );
  await act(async () => {
    fireEvent.press(view.getByTestId('go'));
  });
  const log = view.getByTestId('log').props.children as string;
  view.unmount();
  return log;
};

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockReturnValue(true);
  mockBackdoor.mockReset();
  mockBackdoor.mockResolvedValue({});
});

describe('asking what he can do', () => {
  it('answers from the phone, without troubling the desk', async () => {
    const log = await ask('what can you do');

    expect(log).toContain('user: what can you do');
    expect(log).toContain('At present, sir');
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockBackdoor).not.toHaveBeenCalled();
  });

  it('names a gap too, so nothing is hunted for that was never built', async () => {
    expect(await ask('what are your features')).toContain('Not yet:');
  });

  it('still sends an ordinary command to the desk', async () => {
    // the intercept is narrow on purpose; a greedy match would swallow real work
    await ask('lock the desk');
    expect(mockSend).toHaveBeenCalled();
  });

  it('still sends a question about what he can SEE', async () => {
    // that one is about the camera and belongs to the model
    await ask('what can you see in this photo');
    expect(mockSend).toHaveBeenCalled();
  });
});

/**
 * What became of the turn you sent, recorded on the turn itself.
 *
 * Reported from the device 2026-08-21: "I sent a message then closed the app and
 * didn't get a reply back." Four outcomes used to leave identical entries on screen —
 * carried by the socket, carried by REST, answered by the stand-in, carried by
 * nothing — so there was no evidence either way. `awaiting` is the one that matters:
 * carried, and still owed an answer.
 */
describe('what became of a sent turn', () => {
  const stateOf = async (text: string) => {
    const view = await render(
      <JarvisProvider>
        <Probe say={text} />
      </JarvisProvider>
    );
    await act(async () => {
      fireEvent.press(view.getByTestId('go'));
    });
    const states = view.getByTestId('states').props.children as string;
    view.unmount();
    return states;
  };

  it('waits for an answer once the socket has carried it', async () => {
    mockSend.mockReturnValue(true);
    expect(await stateOf('lock the desk')).toContain('awaiting');
  });

  it('waits for an answer when REST carried it instead', async () => {
    mockSend.mockReturnValue(false);
    mockBackdoor.mockResolvedValue({});
    expect(await stateOf('lock the desk')).toContain('awaiting');
  });

  it('says plainly that nothing carried it', async () => {
    mockSend.mockReturnValue(false);
    mockBackdoor.mockRejectedValue(new Error('Network request failed'));
    expect(await stateOf('lock the desk')).toContain('failed');
  });

  it('does not mark the capability answer as waiting on anything', async () => {
    // answered on the phone, so there is nothing to wait for and nothing that
    // could be dropped
    mockSend.mockReturnValue(true);
    expect(await stateOf('what can you do')).toContain('answered');
  });
});

/**
 * "Open Swiggy" — the first thing this app does *to* the phone.
 *
 * Asked for 2026-08-21. Done by the phone rather than the model, because a model
 * cannot launch anything and can only claim it did.
 */
describe('opening an app', () => {
  const launcher = jest.requireMock('../../../modules/app-launcher') as {
    installed: jest.Mock;
    launch: jest.Mock;
  };

  beforeEach(() => {
    launcher.installed = jest.fn().mockResolvedValue([
      { label: 'Swiggy', pkg: 'in.swiggy.android' },
      { label: 'WhatsApp', pkg: 'com.whatsapp' },
    ]);
    launcher.launch = jest.fn().mockResolvedValue(true);
  });

  it('launches it, and does not trouble the desk', async () => {
    const log = await ask('open swiggy');

    expect(launcher.launch).toHaveBeenCalledWith('in.swiggy.android');
    expect(log).toContain('Swiggy, sir.');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('says plainly when the launch failed', async () => {
    launcher.launch = jest.fn().mockResolvedValue(false);
    expect(await ask('open swiggy')).toContain('I could not open Swiggy, sir.');
  });

  it('leaves anything not installed to the model', async () => {
    // "open the door" is a question about the world, not an instruction to this phone
    await ask('open the door');
    expect(launcher.launch).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalled();
  });

  it('leaves a question about an app to the model', async () => {
    await ask('what is swiggy');
    expect(launcher.launch).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalled();
  });
});
