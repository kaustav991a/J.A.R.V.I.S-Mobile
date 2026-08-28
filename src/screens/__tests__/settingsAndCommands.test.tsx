import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsScreen } from '../SettingsScreen';
import { ChatScreen } from '../ChatScreen';
import { AppearanceProvider } from '../../theme/appearance';
import { clearCrashes, makeCrash, recordCrash } from '../../lib/crashLog';

const mockNavigate = jest.fn();
const mockParentNavigate = jest.fn();

// the chat holds the app-lock gate open while it asks for the microphone, so the
// screen reaches for auth; only that one call matters here
jest.mock('../../security/AuthProvider', () => ({
  useAuth: () => ({ holdGate: jest.fn() }),
}));

jest.mock('@react-navigation/native', () => ({
  // the chat marks itself read on focus, so the mock has to offer the hook —
  // called immediately here, since in a test the screen is always the one on show
  useFocusEffect: (cb: () => undefined | (() => void)) => {
    const cleanup = cb();
    return cleanup;
  },
  // Chat only ticks its clock while focused, so the stub has to answer this.
  useIsFocused: () => true,
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    canGoBack: () => false,
    getParent: () => ({ navigate: mockParentNavigate }),
  }),
}));

const mockSendCommand = jest.fn().mockResolvedValue(undefined);

jest.mock('../../state/JarvisProvider', () => ({
  useJarvis: () => ({
    hud: jest.requireActual('../../state/hudReducer').initialHudState,
    mode: 'offline',
    linkStatus: 'idle',
    lastError: null,
    connected: false,
    connecting: false,
    connect: jest.fn(),
    sendCommand: mockSendCommand,
    decide: jest.fn(),
    recent: [],
    clearRecent: jest.fn(),
    shareLocation: false,
    place: null,
    refreshPlace: jest.fn().mockResolvedValue(undefined),
    setShareLocation: jest.fn().mockResolvedValue(true),
    unread: 0,
    markChatRead: jest.fn(),
    setChatFocused: jest.fn(),
    forgetChat: jest.fn(),
    disconnect: jest.fn(),
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mount = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppearanceProvider>{ui}</AppearanceProvider>
    </SafeAreaProvider>
  );

const BUILD = { version: '1.4.0', updateId: '01a042b3…', platform: 'android 34' };

beforeEach(async () => {
  await clearCrashes();
  mockNavigate.mockClear();
  mockParentNavigate.mockClear();
  mockSendCommand.mockClear();
});

describe('SettingsScreen', () => {
  it('opens Appearance from the rows that lead somewhere', async () => {
    const { getByTestId } = await mount(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-appearance'));
    expect(mockNavigate).toHaveBeenCalledWith('Appearance');
  });

  it('opens Connection inside Settings, without jumping tabs', async () => {
    const { getByTestId } = await mount(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-connection'));
    expect(mockNavigate).toHaveBeenCalledWith('Connection');
    expect(mockParentNavigate).not.toHaveBeenCalled();
  });

  it('opens Security, which is a real screen now that app lock exists', async () => {
    const { getByTestId } = await mount(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-security'));
    expect(mockNavigate).toHaveBeenCalledWith('Security');
  });

  it('opens Diagnostics, which is where a crash is read off without a cable', async () => {
    const { getByTestId } = await mount(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-diagnostics'));
    expect(mockNavigate).toHaveBeenCalledWith('Diagnostics');
  });

  it('says how many crashes have not been looked at, so the screen is not one nobody opens', async () => {
    await recordCrash(
      makeCrash({ error: new Error('boom'), kind: 'js', fatal: true, at: Date.now(), build: BUILD })
    );
    const { findByTestId } = await mount(<SettingsScreen />);
    expect((await findByTestId('settings-diagnostics-count')).props.children).toBe(1);
  });
  it('marks unbuilt rows instead of leaving dead taps', async () => {
    const { getByTestId, getAllByText } = await mount(<SettingsScreen />);
    // the pairing token took Security's place in this group: the token is still
    // owed, but the gates on the phone are built
    expect(getByTestId('settings-pairing').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );
    expect(getAllByText('SOON').length).toBe(3);
  });
});

describe('ChatScreen', () => {
  it('offers commands the backend answers, and sends one on tap', async () => {
    const { getByTestId } = await mount(<ChatScreen />);
    fireEvent.press(getByTestId('suggest-system status'));
    expect(mockSendCommand).toHaveBeenCalledWith('system status');
  });

  it('invites a first command when nothing has been sent', async () => {
    const { getByTestId, getByText } = await mount(<ChatScreen />);
    expect(getByTestId('chat-empty').props.children).toBe('No conversation yet');
    expect(getByText('Say something below, or tap one of these.')).toBeTruthy();
  });
});
