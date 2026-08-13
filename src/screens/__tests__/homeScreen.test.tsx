import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from '../HomeScreen';
import { AppearanceProvider } from '../../theme/appearance';
import { greetingFor } from '../../theme/greeting';

jest.mock('@react-navigation/native', () => ({
  // Home and Chat both take a fresh reading / mark themselves read on focus, so
  // the mock has to offer the hook. Called straight away: in a test the screen
  // under test is always the one on show.
  useFocusEffect: (cb: () => void) => cb(),
  useNavigation: () => ({ navigate: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }),
}));

jest.mock('../../state/JarvisProvider', () => ({
  useJarvis: () => ({
    hud: jest.requireActual('../../state/hudReducer').initialHudState,
    mode: 'offline',
    linkStatus: 'idle',
    lastError: null,
    connected: false,
    connecting: false,
    connect: jest.fn(),
    sendCommand: jest.fn().mockResolvedValue(undefined),
    decide: jest.fn().mockResolvedValue(undefined),
    recent: [],
    clearRecent: jest.fn(),
    shareLocation: false,
    place: null,
    refreshPlace: jest.fn().mockResolvedValue(undefined),
    setShareLocation: jest.fn().mockResolvedValue(true),
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppearanceProvider>
        <HomeScreen />
      </AppearanceProvider>
    </SafeAreaProvider>
  );

describe('HomeScreen', () => {
  it('greets by the device clock, not with a fixed hello', async () => {
    const { getByTestId } = await mount();
    expect(getByTestId('home-greeting').props.children).toBe(greetingFor());
    expect(getByTestId('home-address').props.children).toBe('SIR');
  });

  it('types the prompt out rather than printing it', async () => {
    const { getByTestId } = await mount();
    expect(getByTestId('home-prompt').props.children).toBe('');
    await waitFor(() => expect(getByTestId('home-prompt').props.children).toBe('How can I assist you today?'), {
      timeout: 4000,
    });
  });

  it('puts a monogram in the small reactor instead of an empty well', async () => {
    const { getByTestId } = await mount();
    expect(getByTestId('arc-reactor-monogram').props.children).toBe('J');
  });

  it('reads Disconnected while the link is down', async () => {
    const { getByTestId } = await mount();
    expect(getByTestId('home-link').props.children).toBe('Disconnected');
  });
});
