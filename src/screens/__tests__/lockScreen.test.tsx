import { AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppearanceProvider } from '../../theme/appearance';
import { LockScreen } from '../LockScreen';

const mockUnlock = jest.fn();
const mockCancel = jest.fn();
let mockFailure: string | null = null;

jest.mock('../../security/AuthProvider', () => ({
  useAuth: () => ({
    unlock: mockUnlock,
    lastFailure: mockFailure,
    sensorLabel: 'Fingerprint',
  }),
}));

jest.mock('../../lib/biometrics', () => ({
  cancel: (...args: unknown[]) => mockCancel(...args),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** capture the AppState listener the screen installs */
const listen = () => {
  const calls: ((s: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, cb: (s: string) => void) => {
    calls.push(cb);
    return { remove: jest.fn() };
  }) as never);
  return calls;
};

const mount = async () =>
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppearanceProvider>
        <LockScreen />
      </AppearanceProvider>
    </SafeAreaProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockFailure = null;
  mockUnlock.mockResolvedValue(true);
  mockCancel.mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('LockScreen', () => {
  it('asks on its own, without waiting to be tapped', async () => {
    listen();
    await mount();
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
  });

  it('settles any stale sheet before opening another', async () => {
    // Android leaves authenticateAsync unresolved when the app is sent away, so
    // asking again without cancelling gives it two prompts and no answers
    listen();
    await mount();
    await waitFor(() => expect(mockCancel).toHaveBeenCalled());
  });

  it('asks again when the app comes back', async () => {
    // the bug this fixes: a locked screen never unmounts, so the one-shot mount
    // prompt never fired again and the screen sat there asking for nothing
    const calls = listen();
    await mount();
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));

    // a real return is far later than the cold-start settle window
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    await act(async () => {
      calls.forEach((cb) => cb('active'));
    });
    clock.mockRestore();
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(2));
  });

  it('does not double-prompt on the active event that trails a cold start', async () => {
    // asking twice there cancels the sheet that just opened and flickers it.
    // The clock is frozen because the guard is wall-clock: under jest, mounting
    // the reactor's ignition takes long enough on its own to drift past the
    // window, which would make this pass or fail on render speed rather than on
    // the behaviour being tested.
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const calls = listen();
    await mount();
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
    await act(async () => {
      calls.forEach((cb) => cb('active'));
    });
    expect(mockUnlock).toHaveBeenCalledTimes(1);
    clock.mockRestore();
  });

  it('ignores the app leaving — cancelling there would kill our own sheet', async () => {
    const calls = listen();
    await mount();
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
    await act(async () => {
      calls.forEach((cb) => cb('background'));
    });
    expect(mockUnlock).toHaveBeenCalledTimes(1);
  });

  it('can still be asked by hand', async () => {
    const calls = listen();
    const { getByTestId } = await mount();
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
    expect(calls.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.press(getByTestId('lock-unlock'));
    });
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(2));
  });

  it('says why the last attempt failed rather than repeating the invitation', async () => {
    mockFailure = 'lockout';
    listen();
    const { getByText } = await mount();
    expect(getByText(/Too many attempts/)).toBeTruthy();
  });
});
