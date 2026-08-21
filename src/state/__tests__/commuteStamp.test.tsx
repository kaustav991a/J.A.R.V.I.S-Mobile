import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render } from '@testing-library/react-native';
import { JarvisProvider, useJarvis } from '../JarvisProvider';
import { cloudArmed } from '../../lib/commute';

/**
 * Standing the phone's own briefing task down once the gateway holds the schedule.
 *
 * Both fired on 2026-08-21 and the same briefing arrived twice: the gateway push and
 * the phone's WorkManager task, each with its own once-a-day marker and neither aware
 * of the other. The phone half was always described as a fallback and had never been
 * gated, which made it a second sender.
 *
 * The decision itself is covered in `lib/__tests__/commute.test.ts` and the task's
 * side in `lib/__tests__/commuteTask.test.ts`. What is under test here is the one
 * remaining link: the provider stamping the clock **only** when the upload landed.
 *
 * **Its own file rather than a describe in `jarvisProvider.test.tsx`.** That file has
 * a partly-fixed act-environment fault which blanks a late render — the note at the
 * foot of it has the detail. A fresh module registry sidesteps it.
 */
const mockSyncCommute = jest.fn();

jest.mock('../../link/useLink', () => ({
  useLink: () => ({
    mode: 'cloud',
    status: 'open',
    lastError: null,
    send: jest.fn(() => true),
    sendVoice: jest.fn(() => false),
    reprobe: jest.fn(),
    disconnect: jest.fn(),
  }),
}));

jest.mock('../../api/client', () => ({
  createApi: () => ({
    backdoor: jest.fn().mockResolvedValue({}),
    pending: jest.fn().mockResolvedValue({}),
    confirm: jest.fn().mockResolvedValue(undefined),
    answerWatch: jest.fn().mockResolvedValue(undefined),
    tasks: jest.fn().mockResolvedValue({}),
    presence: jest.fn().mockResolvedValue({}),
    registerPush: jest.fn().mockResolvedValue(undefined),
    syncCommute: mockSyncCommute,
  }),
}));

jest.mock('../../lib/notify', () => ({
  WATCH_CATEGORY: 'watch',
  WATCH_CHANNEL: 'watch',
  GENERAL_CHANNEL: 'general',
  alertFromLaunch: jest.fn().mockResolvedValue(null),
  dismiss: jest.fn().mockResolvedValue(undefined),
  onAlertTapped: jest.fn(() => jest.fn()),
  pendingReplies: jest.fn().mockResolvedValue([]),
  onPushReply: jest.fn(() => jest.fn()),
  replyFromLaunch: jest.fn().mockResolvedValue(null),
  postNow: jest.fn().mockResolvedValue(undefined),
  registerForPush: jest.fn().mockResolvedValue(null),
  shouldNotifyReply: jest.fn(() => false),
}));

jest.mock('../../navigation/RootNavigator', () => ({ openChat: jest.fn() }));
jest.mock('../../lib/haptics', () => ({ haptic: { good: jest.fn() } }));
jest.mock('../../lib/journal/rollup', () => ({
  usageForAsk: async () => ({ today: 42, pickups: 7, top: ['Gmail'], usual: 60, days: 3 }),
}));
jest.mock('../chatStore', () => ({
  loadChat: jest.fn().mockResolvedValue([]),
  saveChat: jest.fn().mockResolvedValue(undefined),
  clearChat: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../lib/place', () => ({
  FIX_TTL_MS: 60000,
  askForLocation: jest.fn().mockResolvedValue(false),
  currentFix: jest.fn().mockResolvedValue(null),
  forgetTrail: jest.fn().mockResolvedValue(undefined),
  loadShareLocation: jest.fn().mockResolvedValue(false),
  loadTrail: jest.fn().mockResolvedValue([]),
  rememberPlace: jest.fn().mockResolvedValue(undefined),
  saveShareLocation: jest.fn().mockResolvedValue(undefined),
  weatherFor: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../lib/knownPlaces', () => ({
  loadKnown: jest.fn().mockResolvedValue([]),
  nameFor: jest.fn(() => null),
}));

function Probe() {
  const { syncCommute } = useJarvis();
  return (
    <Text testID="sync" onPress={() => void syncCommute().catch(() => {})}>
      sync
    </Text>
  );
}

const pressSync = async () => {
  const view = await render(
    <JarvisProvider>
      <Probe />
    </JarvisProvider>
  );
  await act(async () => {
    fireEvent.press(view.getByTestId('sync'));
  });
  view.unmount();
};

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSyncCommute.mockReset();
  mockSyncCommute.mockResolvedValue(undefined);
});

describe('handing the schedule to the gateway', () => {
  it('stands the local task down once the upload is accepted', async () => {
    expect(await cloudArmed(new Date())).toBe(false);

    await pressSync();

    expect(mockSyncCommute).toHaveBeenCalled();
    expect(await cloudArmed(new Date())).toBe(true);
  });

  it('leaves the local task armed when the upload failed', async () => {
    // an upload that did not land must not silence the fallback: a duplicate is an
    // annoyance, and a morning with no briefing is the feature not existing
    mockSyncCommute.mockRejectedValue(new Error('Network request failed'));

    await pressSync();

    expect(mockSyncCommute).toHaveBeenCalled();
    expect(await cloudArmed(new Date())).toBe(false);
  });
});
