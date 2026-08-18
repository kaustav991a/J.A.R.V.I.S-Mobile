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

/**
 * What the mocked provider reports, per test.
 *
 * Jest only permits a factory to reach an out-of-scope name when it is prefixed
 * `mock` — see the same note in `notify.test.ts`.
 */
let mockJarvis: Record<string, unknown> = {};

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
    alertsUnread: 0,
    markAlertsRead: jest.fn(),
    ...mockJarvis,
  }),
}));

beforeEach(() => {
  mockJarvis = {};
});

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

/**
 * The bell's count.
 *
 * It carried a dot, and the dot was driven by `parked.length` alone — so a timeline
 * full of things nobody had looked at was indistinguishable from an empty one. The
 * count answers "how much" rather than only "is anything blocked".
 *
 * Parked approvals are summed in rather than replaced, because one 23px glyph
 * cannot carry two marks and an approval must never be hidden behind a read count.
 */
describe('the bell count', () => {
  const state = jest.requireActual('../../state/hudReducer').initialHudState;
  const parked = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      goal: 'delete a file',
      action: 'rm',
      detail: 'temp.txt',
      at: 1,
    }));

  it('shows nothing at all when there is nothing to show', async () => {
    const { queryByTestId } = await mount();
    await waitFor(() => expect(queryByTestId('home-alert-count')).toBeNull());
  });

  it('counts unread activity', async () => {
    mockJarvis = { alertsUnread: 3 };
    const { findByTestId, getByText } = await mount();
    expect(await findByTestId('home-alert-count')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
  });

  it('adds a parked approval to the count rather than hiding behind it', async () => {
    // the old dot's whole job, kept: something needing a decision always marks the
    // bell, even with everything read
    mockJarvis = { alertsUnread: 0, hud: { ...state, parked: parked(1) } };
    const { getByText } = await mount();
    await waitFor(() => expect(getByText('1')).toBeTruthy());
  });

  it('sums the two kinds of attention', async () => {
    mockJarvis = { alertsUnread: 2, hud: { ...state, parked: parked(1) } };
    const { getByText } = await mount();
    await waitFor(() => expect(getByText('3')).toBeTruthy());
  });

  it('caps the digit rather than stretching the bell', async () => {
    mockJarvis = { alertsUnread: 40 };
    const { getByText } = await mount();
    await waitFor(() => expect(getByText('9+')).toBeTruthy());
  });
});
