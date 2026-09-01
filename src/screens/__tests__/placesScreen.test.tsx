import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cloudArmedState, markCloudArmed } from '../../lib/commute';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppearanceProvider } from '../../theme/appearance';
import { PlacesScreen } from '../PlacesScreen';
import type { HealthReading } from '../../lib/taskHealth';

/**
 * The screen that says whether the fallback is armed — and, since 2026-08-26, does
 * something about it when it is not.
 *
 * The device was found with two departures switched on and no registration in
 * WorkManager. Reporting that is an improvement on the old "Available" badge and is
 * still an answer nobody can act on from this screen: the only repair is a re-arm,
 * and the app is the only thing that can ask for one.
 */

const mockHealth = jest.fn();
const mockSet = jest.fn();
const mockForget = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), canGoBack: () => true, navigate: jest.fn() }),
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));

jest.mock('../../lib/commuteTask', () => ({
  commuteTaskAvailable: async () => true,
  commuteTaskHealth: (...a: unknown[]) => mockHealth(...a),
  setCommuteTask: (...a: unknown[]) => mockSet(...a),
  previewBriefing: async () => null,
}));

jest.mock('../../lib/taskHealth', () => ({
  ...jest.requireActual('../../lib/taskHealth'),
  forgetHeartbeat: () => mockForget(),
}));

jest.mock('../../lib/knownPlaces', () => ({
  FIXED_SLOTS: [
    { id: 'home', label: 'Home' },
    { id: 'office', label: 'Office' },
  ],
  loadKnown: async () => [],
  forgetPlace: async () => [],
  nameHere: async () => [],
}));

jest.mock('../../lib/place', () => ({ currentFix: async () => null }));
jest.mock('../../lib/haptics', () => ({ haptic: { good: jest.fn(), bad: jest.fn(), tap: jest.fn() } }));
jest.mock('../../state/JarvisProvider', () => ({
  useJarvis: () => ({ shareLocation: false, syncCommute: jest.fn() }),
}));
jest.mock('../../components/ui/Toast', () => ({ useToast: () => ({ show: jest.fn() }) }));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppearanceProvider>
        <PlacesScreen />
      </AppearanceProvider>
    </SafeAreaProvider>
  );

const reading = (over: Partial<HealthReading> = {}): HealthReading => ({
  health: 'alive',
  since: 60_000,
  beat: { at: 1, outcome: 'idle', runs: 4 },
  arm: null,
  armAge: null,
  ...over,
});

const sendIntent = jest.spyOn(Linking, 'sendIntent');
const openSettings = jest.spyOn(Linking, 'openSettings');

beforeEach(() => {
  mockHealth.mockReset().mockResolvedValue(reading());
  mockSet.mockReset().mockResolvedValue({ ok: true, reason: null });
  mockForget.mockReset().mockResolvedValue(undefined);
  sendIntent.mockReset().mockResolvedValue(undefined);
  openSettings.mockReset().mockResolvedValue(undefined);
});

describe('the background briefing row', () => {
  it('asks Android to arm the fallback again when it finds nothing registered', async () => {
    // the state the device was in: switched on, and no job for this uid
    mockHealth.mockResolvedValueOnce(reading({ health: 'unarmed', beat: null })).mockResolvedValueOnce(reading());
    const { getByTestId } = await mount();

    await waitFor(() => expect(mockSet).toHaveBeenCalledWith(true));
    await waitFor(() => expect(getByTestId('commute-health').props.children).toContain('Last ran'));
  });

  it('does not re-arm anything when no departure is switched on', async () => {
    // `off` is not a defect, and asking Android to register a task nobody wants is
    // how the phone ends up waking every fifteen minutes to do nothing
    mockHealth.mockResolvedValue(reading({ health: 'off', beat: null }));
    await mount();

    await waitFor(() => expect(mockHealth).toHaveBeenCalled());
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('tries once and then says so, rather than asking again on every render', async () => {
    // a re-arm that fails is a platform refusal; repeating it turns one refusal into
    // a loop, and the reason on screen stops changing while the calls keep going
    const stuck = reading({
      health: 'unarmed',
      beat: null,
      arm: { at: 0, ok: false, reason: 'TaskManager is not available' },
      armAge: 60_000,
    });
    mockHealth.mockResolvedValue(stuck);
    mockSet.mockResolvedValue({ ok: false, reason: 'TaskManager is not available' });
    const { getByTestId } = await mount();

    await waitFor(() =>
      expect(getByTestId('commute-health').props.children).toContain('TaskManager is not available')
    );
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  /**
   * How "did he come back after the reboot?" gets answered without `adb logcat` on
   * the one machine that built the APK: clear the count, reboot, leave the app
   * closed, and come back to see whether the task wrote one on its own.
   */
  it('clears the run count, which is how the reboot check is started', async () => {
    mockHealth.mockResolvedValue(reading());
    const { getByTestId } = await mount();
    await waitFor(() => expect(getByTestId('commute-health').props.children).toContain('Last ran'));

    fireEvent.press(getByTestId('commute-reset-runs'));

    await waitFor(() => expect(mockForget).toHaveBeenCalled());
    // and the row re-reads, so the count on screen is the one that was just cleared
    await waitFor(() => expect(mockHealth.mock.calls.length).toBeGreaterThan(1));
  });
});

/**
 * The lever that decides whether an armed task ever gets a window.
 *
 * Measured on this device: standby bucket 40 (RARE), not on the device-idle
 * whitelist, and `Network: blocked=REASON_APP_STANDBY` for this uid. A registration
 * it never runs is the same morning as no registration, so this row is not decoration
 * — and `openSettings()` lands on the app's own settings page, from which the
 * battery-optimisation list is three taps and a menu away.
 */
describe('the battery restrictions row', () => {
  it('opens Android’s battery optimisation list rather than the app’s settings page', async () => {
    const { getByTestId } = await mount();

    fireEvent.press(getByTestId('commute-battery-settings'));

    await waitFor(() =>
      expect(sendIntent).toHaveBeenCalledWith('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS')
    );
    expect(openSettings).not.toHaveBeenCalled();
  });

  it('falls back to the app’s settings page on a phone with no such screen', async () => {
    // the intent is not guaranteed to resolve — an OEM build without the activity
    // throws, and a dead button is worse than the longer route
    sendIntent.mockRejectedValueOnce(new Error('no activity found'));
    const { getByTestId } = await mount();

    fireEvent.press(getByTestId('commute-battery-settings'));

    await waitFor(() => expect(openSettings).toHaveBeenCalled());
  });
});

/**
 * Proving the unarmed sentence, which until now could not be seen at all.
 *
 * `fallback-armed` has sat `partial` since 2026-08-26 for one reason: the armed half
 * was proved on the device, and the other half — "says so when it is not" — could
 * not be induced. The app re-arms itself at launch and on every visit to this
 * screen, so the state the row exists to report heals before anyone can look at it.
 *
 * So it is made inducible on purpose. Unregistering is the one thing that cannot be
 * faked from outside, and the repair is already automatic: leaving Places and coming
 * back arms it again, which is the same path that fixed the real occurrence.
 */
describe('proving the fallback says so when it is not armed', () => {
  it('unregisters the task when asked, rather than only describing what would happen', async () => {
    const { getByTestId } = await mount();
    await waitFor(() => expect(getByTestId('commute-health')).toBeTruthy());

    mockHealth.mockResolvedValue(reading({ health: 'unarmed', beat: null }));
    fireEvent.press(getByTestId('commute-disarm'));

    await waitFor(() => expect(mockSet).toHaveBeenCalledWith(false));
  });

  it('shows the unarmed sentence afterwards, which is the whole point of the exercise', async () => {
    const { getByTestId } = await mount();
    await waitFor(() => expect(getByTestId('commute-health')).toBeTruthy());

    mockHealth.mockResolvedValue(reading({ health: 'unarmed', beat: null }));
    fireEvent.press(getByTestId('commute-disarm'));

    await waitFor(() =>
      expect(getByTestId('commute-health').props.children).toContain('not armed')
    );
  });

  it('is not offered when there is nothing armed to disarm', async () => {
    // an action that would do nothing is worse than an absent one: it teaches that
    // the row's controls are decoration
    mockHealth.mockResolvedValue(reading({ health: 'unarmed', beat: null }));
    const { queryByTestId } = await mount();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith(true));
    expect(queryByTestId('commute-disarm')).toBeNull();
  });
});

/**
 * The gateway stamp, and making its stale state reachable.
 *
 * `status-panel` sat `partial` over one row: the briefing's `CANNOT TELL`, which needs
 * the upload stamp older than 48 hours. It refreshes on every cloud connect, so it
 * never goes stale on its own, and the only other lever is the phone's clock — which
 * must not move, because the timeline is mid-count and the journal is time-keyed.
 */
describe('the gateway briefing stamp', () => {
  it('says the gateway holds the schedule when the stamp is fresh', async () => {
    await markCloudArmed(Date.now());
    const { findByTestId } = await mount();
    expect((await findByTestId('cloud-stamp')).props.children).toContain('holds');
  });

  it('ages the stamp when asked, so the panel can be read in its third state', async () => {
    await markCloudArmed(Date.now());
    const { findByTestId } = await mount();
    fireEvent.press(await findByTestId('cloud-stamp-age'));
    await waitFor(async () => expect(await cloudArmedState()).toBe('stale'));
  });

  it('offers nothing to age when nothing was ever uploaded', async () => {
    // `never` and `stale` are different facts; a control that invented a stamp would
    // make the app claim an upload that did not happen
    await AsyncStorage.removeItem('jarvis_commute_cloud');
    const { queryByTestId, findByTestId } = await mount();
    await findByTestId('cloud-stamp');
    expect(queryByTestId('cloud-stamp-age')).toBeNull();
  });
});
