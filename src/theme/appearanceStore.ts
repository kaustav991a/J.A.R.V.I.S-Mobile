import AsyncStorage from '@react-native-async-storage/async-storage';

import { ACCENTS } from './appearance';
import type { AccentKey } from './appearance';

/**
 * The look, kept across launches.
 *
 * Accent, glow and motion were in-memory from the start, on the reasoning that
 * persisting them belonged with the token storage work so one place owned writing to
 * the device. That never happened, and meanwhile every launch reset the app to blue
 * — a setting that does not survive reads as a setting that did not work, and this
 * one is visible on the first frame of every launch.
 *
 * **Motion is tri-state on disk and that is the whole subtlety.** `null` means nobody
 * has touched the switch, so the OS still decides and keeps deciding; `true` / `false`
 * mean the switch was set, which outranks the OS permanently. Storing `true` for
 * "never asked" would silently override reduced motion for someone who had turned it
 * on at the system level — the app not listening, which is exactly the behaviour the
 * provider was changed to stop.
 *
 * Every read is defensive for the usual reason: this file is written by one build and
 * read by the next. An accent key from a future build that this one cannot resolve
 * would render as `undefined` and take the tint off every screen at once, so an
 * unknown key is treated as nothing stored rather than as a colour.
 */
export const APPEARANCE_KEY = 'jarvis_appearance';

export type StoredAppearance = {
  accentKey: AccentKey;
  glow: number;
  /** null means the switch has never been touched and the OS still decides */
  animations: boolean | null;
};

const clamp = (n: number): number => Math.min(1, Math.max(0, n));

export async function loadAppearance(): Promise<StoredAppearance | null> {
  try {
    const raw = await AsyncStorage.getItem(APPEARANCE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const o = parsed as Record<string, unknown>;

    // an unknown accent is nothing stored, not a colour: `ACCENTS[key]` would be
    // undefined and every tint in the app would go with it
    if (typeof o.accentKey !== 'string' || !(o.accentKey in ACCENTS)) return null;
    if (typeof o.glow !== 'number' || !Number.isFinite(o.glow)) return null;
    // all three or none. Half a look restored is harder to explain than a default one
    if (!(o.animations === null || typeof o.animations === 'boolean')) return null;

    return {
      accentKey: o.accentKey as AccentKey,
      glow: clamp(o.glow),
      animations: o.animations,
    };
  } catch {
    return null;
  }
}

export async function saveAppearance(look: StoredAppearance): Promise<void> {
  try {
    await AsyncStorage.setItem(APPEARANCE_KEY, JSON.stringify(look));
  } catch {
    // the look reverting on the next launch is a disappointment; a settings screen
    // that throws while you touch it is a bug
  }
}
