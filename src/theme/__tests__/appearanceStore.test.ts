import AsyncStorage from '@react-native-async-storage/async-storage';

import { APPEARANCE_KEY, loadAppearance, saveAppearance } from '../appearanceStore';

/**
 * The look, surviving the process.
 *
 * Accent, glow and motion were in-memory, so every launch reset them — a setting
 * that does not persist reads as a setting that did not work, and this one is
 * visible on the very first frame.
 *
 * **The subtle field is motion, which is tri-state on disk.** `null` means nobody
 * has touched the switch and the OS still decides; `true`/`false` mean the switch
 * was set and outranks the OS from then on. Writing `true` for "never asked" would
 * quietly override reduced motion for someone who had turned it on at the system
 * level — the app not listening, which is the exact behaviour the provider was
 * changed to stop.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('reading the look back', () => {
  it('answers with nothing stored rather than a guess', async () => {
    expect(await loadAppearance()).toBeNull();
  });

  it('reads back what was written', async () => {
    await saveAppearance({ accentKey: 'violet', glow: 0.3, animations: false });
    expect(await loadAppearance()).toEqual({ accentKey: 'violet', glow: 0.3, animations: false });
  });

  it('keeps "nobody has said" distinct from "off"', async () => {
    await saveAppearance({ accentKey: 'blue', glow: 0.6, animations: null });
    expect((await loadAppearance())?.animations).toBeNull();
  });

  it('refuses an accent that is not one of the five', async () => {
    // a key from a future build, read by an older one: a colour that does not
    // resolve renders as undefined and takes the tint off every screen at once
    await AsyncStorage.setItem(
      APPEARANCE_KEY,
      JSON.stringify({ accentKey: 'chartreuse', glow: 0.6, animations: null })
    );
    expect(await loadAppearance()).toBeNull();
  });

  it('clamps a glow that is out of range instead of trusting it', async () => {
    await AsyncStorage.setItem(APPEARANCE_KEY, JSON.stringify({ accentKey: 'blue', glow: 9, animations: null }));
    expect((await loadAppearance())?.glow).toBe(1);
    await AsyncStorage.setItem(APPEARANCE_KEY, JSON.stringify({ accentKey: 'blue', glow: -3, animations: null }));
    expect((await loadAppearance())?.glow).toBe(0);
  });

  it('reads nothing rather than throwing when the store is rubbish', async () => {
    await AsyncStorage.setItem(APPEARANCE_KEY, '{not json');
    expect(await loadAppearance()).toBeNull();
  });

  it('treats a half-written record as nothing, rather than half a look', async () => {
    await AsyncStorage.setItem(APPEARANCE_KEY, JSON.stringify({ accentKey: 'violet' }));
    expect(await loadAppearance()).toBeNull();
  });

  it('never throws when the disk refuses a write', async () => {
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('no space')));
    await expect(
      saveAppearance({ accentKey: 'pink', glow: 0.5, animations: true })
    ).resolves.toBeUndefined();
  });
});
