import { requireNativeModule } from 'expo';

/**
 * The Android usage-stats API, and nothing else.
 *
 * Deliberately knows nothing about JARVIS: this is a translation of one platform
 * API, so everything above it can talk to an interface and be tested against a
 * fake. The native half is the only part of the journal that needs a device.
 */
const native = requireNativeModule('UsageStats');

/** says so out loud when the native side IS loaded — see the Kotlin comment */
export function ping(): string {
  return native.ping();
}

/** 'granted' | 'denied' | 'unavailable'. Re-asked every sync; never cached */
export function permission(): string {
  return native.permission();
}

/** opens Android's Usage access list, from which the grant is made by hand */
export function openSettings(): boolean {
  return native.openSettings();
}

/** per-day totals; `end` stamps the bucket, so a row lands on its own day */
export async function queryDaily(
  from: number,
  to: number
): Promise<{ app: string; ms: number; end: number }[]> {
  return await native.queryDaily(from, to);
}

export async function queryEvents(
  from: number,
  to: number
): Promise<{ at: number; kind: string; app: string | null }[]> {
  return await native.queryEvents(from, to);
}
