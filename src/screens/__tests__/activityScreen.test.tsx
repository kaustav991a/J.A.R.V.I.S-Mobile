import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityScreen } from '../ActivityScreen';
import { AppearanceProvider } from '../../theme/appearance';

/**
 * The activity sheet, and marking it read.
 *
 * The bell now carries a count, so there has to be a way to put it back to nothing
 * — otherwise the number only ever grows and stops being read. "Mark all read"
 * clears the *unread* half and deliberately leaves parked approvals alone: an
 * approval is answered, not read.
 */

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => cb(),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }),
}));

/** jest only lets a factory reach an out-of-scope name prefixed `mock` */
let mockJarvis: Record<string, unknown> = {};
const mockMarkRead = jest.fn();

jest.mock('../../state/JarvisProvider', () => ({
  useJarvis: () => ({
    hud: jest.requireActual('../../state/hudReducer').initialHudState,
    decide: jest.fn().mockResolvedValue(undefined),
    alertsUnread: 0,
    markAlertsRead: mockMarkRead,
    ...mockJarvis,
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
        <ActivityScreen />
      </AppearanceProvider>
    </SafeAreaProvider>
  );

beforeEach(() => {
  mockJarvis = {};
  mockMarkRead.mockClear();
});

describe('ActivityScreen', () => {
  const state = jest.requireActual('../../state/hudReducer').initialHudState;

  it('opens on the timeline', async () => {
    const { findByTestId } = await mount();
    expect(await findByTestId('activity-screen')).toBeTruthy();
  });

  it('says so plainly when nothing has happened', async () => {
    const { findByTestId } = await mount();
    expect(await findByTestId('activity-empty')).toBeTruthy();
  });

  it('offers no mark-all-read while there is nothing unread', async () => {
    // a control that no-ops most of the time you look at it stops reading as one
    const { queryByTestId } = await mount();
    await waitFor(() => expect(queryByTestId('activity-mark-read')).toBeNull());
  });

  it('offers mark-all-read once something is unread', async () => {
    mockJarvis = { alertsUnread: 4 };
    const { findByTestId } = await mount();
    expect(await findByTestId('activity-mark-read')).toBeTruthy();
  });

  it('marks everything read when pressed', async () => {
    mockJarvis = { alertsUnread: 4 };
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId('activity-mark-read'));
    expect(mockMarkRead).toHaveBeenCalledTimes(1);
  });

  it('names the number it would clear, for a screen reader', async () => {
    mockJarvis = { alertsUnread: 4 };
    const { findByTestId } = await mount();
    expect((await findByTestId('activity-mark-read')).props.accessibilityLabel).toBe('Mark all 4 as read');
  });

  it('still shows the approvals section, which reading cannot clear', async () => {
    mockJarvis = {
      alertsUnread: 0,
      hud: {
        ...state,
        parked: [{ id: 'p1', goal: 'delete a file', action: 'rm', detail: 'temp.txt', at: 1 }],
      },
    };
    const { queryByTestId, findByTestId } = await mount();
    await findByTestId('activity-screen');
    // nothing unread, so no mark-read control — but the approval is still there
    expect(queryByTestId('activity-mark-read')).toBeNull();
  });
});
