import { Platform } from 'react-native';
import * as Updates from 'expo-updates';

import { crashBuild } from '../crashBuild';

/**
 * Which build died.
 *
 * A crash on the bundle from three publishes ago is a different crash from the same
 * words on today's, and without the update id the record cannot tell them apart —
 * which is exactly the confusion this project has already paid for once, reading a
 * screen that was still running old code.
 *
 * Native-facing, so it is thin on purpose: everything here can be undefined in a
 * development client, and none of it may throw. It runs while the app is dying.
 */

jest.mock('expo-constants', () => ({ expoConfig: { version: '1.4.0' } }));

jest.mock('expo-updates', () => ({
  updateId: '01a042b3-0000-0000-0000-000000000000',
  isEmbeddedLaunch: false,
}));

const mocked = Updates as unknown as { updateId: string | null; isEmbeddedLaunch: boolean };

describe('the build a crash belongs to', () => {
  it('carries the app version', () => {
    expect(crashBuild().version).toBe('1.4.0');
  });

  it('carries the update it was running, shortened the way every other screen shows it', () => {
    expect(crashBuild().updateId).toBe('01a042b3…');
  });

  it('says so when the bundle is the one built into the APK', () => {
    mocked.isEmbeddedLaunch = true;
    expect(crashBuild().updateId).toBe('built in');
    mocked.isEmbeddedLaunch = false;
  });

  it('names the platform, because a fix may only apply to one', () => {
    expect(crashBuild().platform).toContain(Platform.OS);
  });

  it('answers rather than throwing when the native side has nothing to say', () => {
    mocked.updateId = null;
    expect(() => crashBuild()).not.toThrow();
    expect(crashBuild().updateId).toBe('—');
    mocked.updateId = '01a042b3-0000-0000-0000-000000000000';
  });
});
