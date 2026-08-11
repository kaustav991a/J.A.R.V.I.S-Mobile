import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsScreen } from '../SettingsScreen';
import { ChatScreen } from '../ChatScreen';
import { AppearanceProvider } from '../../theme/appearance';

const mockNavigate = jest.fn();
const mockParentNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
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

beforeEach(() => {
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

  it('sends Connection to the Home stack, where that screen lives', async () => {
    const { getByTestId } = await mount(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-connection'));
    expect(mockParentNavigate).toHaveBeenCalledWith('Home', { screen: 'Connection' });
  });

  it('marks unbuilt rows instead of leaving dead taps', async () => {
    const { getByTestId, getAllByText } = await mount(<SettingsScreen />);
    expect(getByTestId('settings-security').props.accessibilityState).toEqual(
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
