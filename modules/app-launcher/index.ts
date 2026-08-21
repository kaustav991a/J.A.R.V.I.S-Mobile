import { requireNativeModule } from 'expo';

/**
 * Launching an installed app, and listing what there is to launch.
 *
 * Deliberately knows nothing about JARVIS: a translation of two PackageManager
 * calls, so everything above it talks to an interface and is tested against a fake.
 * The native half is the only part that needs a device.
 */
const native = requireNativeModule('AppLauncher');

/** says so out loud when the native side IS loaded — see the Kotlin comment */
export function ping(): string {
  return native.ping();
}

/** every app with a launcher icon, label and package, sorted by label */
export async function installed(): Promise<Array<{ label: string; pkg: string }>> {
  return native.installed();
}

/** bring one app to the front. False when it could not be done, never a throw */
export async function launch(pkg: string): Promise<boolean> {
  return native.launch(pkg);
}
