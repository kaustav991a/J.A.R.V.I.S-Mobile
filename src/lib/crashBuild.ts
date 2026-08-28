import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

import type { CrashBuild } from './crashLog';
import { shortId } from './updates';

/**
 * Which build a crash belongs to.
 *
 * Kept apart from `crashLog.ts` so that file stays pure and testable: this is the
 * only place the crash record touches the native side. The update id is the field
 * that earns its place — the same words thrown on the bundle from three publishes
 * ago are a different fault from the same words thrown on today's, and this project
 * has already spent a session reading a screen that was still running old code.
 *
 * Every value here can be missing in a development client, and none of it may
 * throw: it is read while the app is dying.
 */
export function crashBuild(): CrashBuild {
  const platform = Platform.Version ? `${Platform.OS} ${Platform.Version}` : String(Platform.OS);
  try {
    return {
      version: Constants.expoConfig?.version ?? '?',
      // an embedded launch has no update id, and shortening `null` to a dash would
      // read as one that failed to load rather than one that was never downloaded
      updateId: Updates.isEmbeddedLaunch ? 'built in' : shortId(Updates.updateId),
      platform,
    };
  } catch {
    return { version: '?', updateId: '—', platform };
  }
}
