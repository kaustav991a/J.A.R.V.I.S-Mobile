import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from '../RootNavigator';
import { AppearanceProvider } from '../../theme/appearance';

/** the transport is not under test here; the tabs are */
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
        <RootNavigator />
      </AppearanceProvider>
    </SafeAreaProvider>
  );

describe('RootNavigator', () => {
  it('opens on the Home tab', async () => {
    const { findByTestId } = await mount();
    expect(await findByTestId('home-screen')).toBeTruthy();
  });

  it('carries the five tabs from the reference', async () => {
    const { findByTestId, getByTestId } = await mount();
    await findByTestId('home-screen');
    for (const name of ['Home', 'Scripts', 'Commands', 'Reports', 'Settings']) {
      expect(getByTestId(`tab-${name}`)).toBeTruthy();
    }
  });

  it('names only the selected tab, and marks it selected', async () => {
    const { findByTestId, getByTestId } = await mount();
    await findByTestId('home-screen');
    expect(getByTestId('tab-Home').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(getByTestId('tab-Scripts').props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
  });

  it('sends the Run Script shortcut to the Scripts tab, not back to Home', async () => {
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId('quick-run'));
    expect(await findByTestId('scripts-screen')).toBeTruthy();
  });

  it('sends the Commands shortcut to the Commands tab', async () => {
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId('quick-commands'));
    expect(await findByTestId('commands-screen')).toBeTruthy();
  });

  it('sends the Reports shortcut to the Reports tab', async () => {
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId('quick-reports'));
    expect(await findByTestId('reports-screen')).toBeTruthy();
  });

  it('keeps Connect inside the Home stack', async () => {
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId('quick-connect'));
    expect(await findByTestId('connection-screen')).toBeTruthy();
  });

  it('sends the scripts column of the status card to the Scripts tab', async () => {
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId('home-status-scripts'));
    expect(await findByTestId('scripts-screen')).toBeTruthy();
  });

  it('sends the server column of the status card to Connection', async () => {
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId('home-status-link'));
    expect(await findByTestId('connection-screen')).toBeTruthy();
  });

  it('sends the bell to the activity timeline, inside the Home stack', async () => {
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId('home-alerts'));
    expect(await findByTestId('activity-screen')).toBeTruthy();
  });

  it('opens the quick menu from the hamburger', async () => {
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId('home-menu'));
    expect(await findByTestId('quick-menu')).toBeTruthy();
  });
});
