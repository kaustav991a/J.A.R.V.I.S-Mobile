import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { DiagnosticsScreen } from '../DiagnosticsScreen';
import { AppearanceProvider } from '../../theme/appearance';
import { clearCrashes, loadCrashes, makeCrash, recordCrash, seenAt } from '../../lib/crashLog';

/**
 * The screen a crash is read off, the morning after.
 *
 * The whole value of the record is that it can be looked at without a cable, so
 * this screen has to be legible to someone who was not there: what broke, when,
 * and on which bundle. And it has to be honest about having nothing — an empty
 * list that reads as a failed load is the exact confusion the rest of this app
 * keeps closing.
 */

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), canGoBack: () => true, navigate: jest.fn() }),
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const BUILD = { version: '1.4.0', updateId: '01a042b3…', platform: 'android 34' };

const crash = (message: string, at: number) =>
  makeCrash({
    error: Object.assign(new TypeError(message), {
      stack: `TypeError: ${message}\n    at HomeScreen (app:///src/screens/HomeScreen.tsx:41:9)`,
    }),
    kind: 'render',
    fatal: true,
    at,
    build: BUILD,
  });

const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppearanceProvider>
        <DiagnosticsScreen />
      </AppearanceProvider>
    </SafeAreaProvider>
  );

beforeEach(async () => {
  await clearCrashes();
  (Clipboard.setStringAsync as jest.Mock).mockClear();
});

describe('with nothing to report', () => {
  it('says so, rather than showing an empty list that reads as a failure', async () => {
    const { findByTestId } = await mount();
    expect(await findByTestId('diagnostics-empty')).toBeTruthy();
  });
});

describe('with a crash on disk', () => {
  it('names what broke', async () => {
    await recordCrash(crash('undefined is not a function', 1_724_800_000_000));
    const { findByTestId } = await mount();
    expect((await findByTestId('crash-0-message')).props.children).toContain(
      'undefined is not a function'
    );
  });

  it('says which build it happened on, because that is the first question', async () => {
    await recordCrash(crash('undefined is not a function', 1_724_800_000_000));
    const { findByTestId } = await mount();
    expect((await findByTestId('crash-0-build')).props.children.join('')).toContain('01a042b3');
  });

  it('copies a report rather than making it be read out down a phone', async () => {
    await recordCrash(crash('undefined is not a function', 1_724_800_000_000));
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId('diagnostics-copy'));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalled());
    expect((Clipboard.setStringAsync as jest.Mock).mock.calls[0][0]).toContain(
      'undefined is not a function'
    );
  });

  it('forgets them all when asked, and says it has nothing left', async () => {
    await recordCrash(crash('undefined is not a function', 1_724_800_000_000));
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId('diagnostics-clear'));
    await waitFor(async () => expect(await loadCrashes()).toEqual([]));
    expect(await findByTestId('diagnostics-empty')).toBeTruthy();
  });

  it('counts them as read, so the settings row stops announcing them', async () => {
    await recordCrash(crash('undefined is not a function', 1_724_800_000_000));
    await mount();
    await waitFor(async () => expect(await seenAt()).toBeGreaterThan(0));
  });
});
