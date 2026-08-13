import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { WATCH_CHANNEL, GENERAL_CHANNEL, alertFromData, postNow } from '../notify';

// the factory may not close over anything out of scope, so the handles are
// pulled back off the mocked module below
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  dismissNotificationAsync: jest.fn(),
  AndroidImportance: { MAX: 5, DEFAULT: 3 },
}));

jest.mock('expo-constants', () => ({ expoConfig: null, easConfig: null }));

const schedule = Notifications.scheduleNotificationAsync as unknown as jest.Mock;

/**
 * `jest-expo` runs one platform (iOS), and channels are an Android concept — so
 * the platform has to be stated rather than assumed, or the assertions below
 * pass for the wrong reason.
 */
const asPlatform = (os: 'android' | 'ios') =>
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });

const realOS = Platform.OS;

beforeEach(() => {
  schedule.mockReset();
  schedule.mockResolvedValue('note-id');
  asPlatform('android');
});

afterAll(() => asPlatform(realOS as 'android' | 'ios'));

describe('alertFromData', () => {
  const NOW = 1_700_000_000_000;
  const payload = (over: Record<string, unknown> = {}) => ({
    kind: 'intruder',
    id: 'a1',
    expires_at_ms: NOW + 24_000,
    image: '/shot.jpg',
    user: 'KAUSTAV',
    trigger: 'wake',
    ...over,
  });

  it('rebuilds the alert a sleeping phone never received', () => {
    // the socket cannot reach a suspended app, so the push carries the alert and
    // this is what turns it back into the frame the reducer expects
    expect(alertFromData(payload(), NOW)).toEqual({
      id: 'a1',
      expiresIn: 24,
      image: '/shot.jpg',
      user: 'KAUSTAV',
      trigger: 'wake',
    });
  });

  it('refuses an alert whose window has already closed', () => {
    // the desk locked itself long ago; a live countdown here would be a lie about
    // a machine that is already shut
    expect(alertFromData(payload({ expires_at_ms: NOW - 1000 }), NOW)).toBeNull();
    expect(alertFromData(payload({ expires_at_ms: NOW }), NOW)).toBeNull();
  });

  it('refuses anything it could not answer or was not sent', () => {
    expect(alertFromData(payload({ id: '' }), NOW)).toBeNull();
    expect(alertFromData(payload({ expires_at_ms: null }), NOW)).toBeNull();
    expect(alertFromData({ kind: 'desk_link' }, NOW)).toBeNull();
    expect(alertFromData(null, NOW)).toBeNull();
    expect(alertFromData('intruder', NOW)).toBeNull();
  });

  it('falls back to unlock rather than inventing a trigger', () => {
    const a = alertFromData(payload({ trigger: undefined, image: '', user: '' }), NOW);
    expect(a).toEqual({ id: 'a1', expiresIn: 24, image: null, user: null, trigger: 'unlock' });
  });
});

describe('postNow', () => {
  it('names the channel on the trigger, where Android actually reads it', async () => {
    // It used to be spread into `content`, which has no such field — so every
    // notification landed on Expo's fallback channel: SILENT, no vibration.
    // On device the record read
    // `channel=expo_notifications_fallback_notification_channel`, which meant a
    // desk-watch alert on a MAX-importance channel arrived making no sound at
    // all. `tsc` cannot catch it, because the spread that added it turns off
    // excess-property checking — so this test is the guard.
    await postNow({ title: 'Someone at the desk', body: 'Was this you?', channel: WATCH_CHANNEL });

    const arg = schedule.mock.calls[0][0];
    expect(arg.trigger).toEqual({ channelId: WATCH_CHANNEL });
    expect(arg.content).not.toHaveProperty('channelId');
  });

  it('falls back to the general channel rather than to no channel at all', async () => {
    await postNow({ title: 'J.A.R.V.I.S. is on full power', body: 'The desk is online.' });
    expect(schedule.mock.calls[0][0].trigger).toEqual({ channelId: GENERAL_CHANNEL });
  });

  it('sends no channel on iOS, which has no such concept', async () => {
    asPlatform('ios');
    await postNow({ title: 'x', body: 'y', channel: WATCH_CHANNEL });
    expect(schedule.mock.calls[0][0].trigger).toBeNull();
  });

  it('returns null instead of throwing when the native module is absent', async () => {
    // an older dev build has no module at all; a notification that cannot be
    // posted must not take down whatever was trying to post it
    schedule.mockRejectedValueOnce(new Error('no native module'));
    await expect(postNow({ title: 'x', body: 'y' })).resolves.toBeNull();
  });
});
