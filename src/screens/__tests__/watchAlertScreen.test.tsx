import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppearanceProvider } from '../../theme/appearance';
import { WatchAlertScreen, secondsLeft } from '../WatchAlertScreen';
import type { IntruderAlert } from '../../state/hudReducer';

const mockAnswer = jest.fn();
const mockExpire = jest.fn();
const mockConfirm = jest.fn();

jest.mock('../../state/JarvisProvider', () => ({
  useJarvis: () => ({
    answerWatch: mockAnswer,
    expireWatch: mockExpire,
    deskAsset: (path: string | null) => (path ? `http://desk.local${path}` : null),
  }),
}));

jest.mock('../../security/AuthProvider', () => ({
  useAuth: () => ({ confirmCritical: mockConfirm }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const alert = (over: Partial<IntruderAlert> = {}): IntruderAlert => ({
  id: 'i-1',
  deadline: Date.now() + 30_000,
  image: '/api/intruder/i-1.jpg',
  user: 'KAUSTAV',
  trigger: 'unlock',
  resolving: false,
  ...over,
});

const mount = (a: IntruderAlert) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppearanceProvider>
        <WatchAlertScreen alert={a} />
      </AppearanceProvider>
    </SafeAreaProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockAnswer.mockResolvedValue(undefined);
  mockConfirm.mockResolvedValue(true);
});

describe('secondsLeft', () => {
  it('counts down from a deadline', () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 7_500)).toBe(3);
  });

  it('never goes negative — a passed deadline is zero, not a countup', () => {
    expect(secondsLeft(10_000, 40_000)).toBe(0);
  });

  it('rounds up, so the last partial second still reads as time left', () => {
    expect(secondsLeft(10_000, 9_100)).toBe(1);
  });
});

describe('WatchAlertScreen', () => {
  it('shows the capture, the cause and the account', async () => {
    const { getByTestId } = await mount(alert());
    expect(getByTestId('watch-mugshot').props.source).toEqual({ uri: 'http://desk.local/api/intruder/i-1.jpg' });
    expect(getByTestId('watch-cause').props.children).toContain('The desk was unlocked');
  });

  it('still stands up when the camera gave the desk nothing', async () => {
    const { getByTestId, queryByTestId } = await mount(alert({ image: null }));
    expect(getByTestId('watch-no-mugshot')).toBeTruthy();
    expect(queryByTestId('watch-mugshot')).toBeNull();
    // the alert is about the desk locking, not about the picture
    expect(getByTestId('watch-count')).toBeTruthy();
  });

  it('names a refused Windows Hello differently from a plain unlock', async () => {
    const { getByTestId } = await mount(alert({ trigger: 'hello_failed' }));
    expect(getByTestId('watch-cause').props.children).toContain('Windows Hello was refused');
  });

  it('falls back to a plain description for a trigger it does not know', async () => {
    const { getByTestId } = await mount(alert({ trigger: 'something_new' }));
    expect(getByTestId('watch-cause').props.children).toContain('The desk saw activity');
  });

  it('gates "it was me" behind the sensor before clearing anything', async () => {
    const { getByTestId } = await mount(alert());
    fireEvent.press(getByTestId('watch-me'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockAnswer).toHaveBeenCalledWith('i-1', true);
  });

  it('does not clear the alert when that gate refuses', async () => {
    mockConfirm.mockResolvedValue(false);
    const { getByTestId } = await mount(alert());
    fireEvent.press(getByTestId('watch-me'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it('locks without asking for a finger — locking is the safe direction', async () => {
    // the desk does this on silence anyway, so a gate here would cost seconds
    // and protect nothing
    const { getByTestId } = await mount(alert());
    fireEvent.press(getByTestId('watch-lock'));
    await waitFor(() => expect(mockAnswer).toHaveBeenCalledWith('i-1', false));
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('offers no answer once the window has already closed', async () => {
    const { getByTestId } = await mount(alert({ deadline: Date.now() - 1_000 }));
    expect(getByTestId('watch-count').props.children).toEqual([0, 's']);
    expect(getByTestId('watch-me').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(getByTestId('watch-lock').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('tells the app the window ran out, so the alert stops claiming to be live', async () => {
    await mount(alert({ deadline: Date.now() - 1_000 }));
    await waitFor(() => expect(mockExpire).toHaveBeenCalledWith('i-1'));
  });

  it('reports the expiry once, not once per tick', async () => {
    await mount(alert({ deadline: Date.now() - 1_000 }));
    await waitFor(() => expect(mockExpire).toHaveBeenCalled());
    const first = mockExpire.mock.calls.length;
    await new Promise((r) => setTimeout(r, 600));
    expect(mockExpire.mock.calls.length).toBe(first);
  });
});
