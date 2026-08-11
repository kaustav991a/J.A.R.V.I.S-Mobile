import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LaunchScreen } from '../LaunchScreen';
import { AppearanceProvider } from '../../theme/appearance';

jest.mock('../../state/JarvisProvider', () => ({
  useJarvis: () => ({
    hud: jest.requireActual('../../state/hudReducer').initialHudState,
    mode: 'offline',
    linkStatus: 'idle',
    lastError: null,
    connected: false,
    connecting: false,
    connect: jest.fn(),
    sendCommand: jest.fn(),
    decide: jest.fn(),
    recent: [],
    clearRecent: jest.fn(),
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mount = (onDone: () => void) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppearanceProvider>
        <LaunchScreen onDone={onDone} />
      </AppearanceProvider>
    </SafeAreaProvider>
  );

describe('LaunchScreen', () => {
  it('shows the reactor over the reference tagline', async () => {
    const { getByTestId } = await mount(jest.fn());
    expect(getByTestId('arc-reactor')).toBeTruthy();
    expect(getByTestId('launch-tagline').props.children).toBe('YOUR INTELLIGENT ASSISTANT');
  });

  it('hands off to the app when tapped', async () => {
    const onDone = jest.fn();
    const { getByTestId } = await mount(onDone);
    fireEvent.press(getByTestId('launch-skip'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
