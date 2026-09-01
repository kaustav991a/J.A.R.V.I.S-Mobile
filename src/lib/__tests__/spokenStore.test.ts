import AsyncStorage from '@react-native-async-storage/async-storage';

import { SPOKEN_KEY, forgetSpoken, loadSpoken, noteSpoken, spokeRecently } from '../spokenStore';

/**
 * The budget behind an unprompted remark.
 *
 * One a day was the whole of it, and one a day is what stops more triggers being
 * worth building: with a single slot and a single remembered subject, a dull
 * observation spends the day's budget as easily as a sharp one, and the sharp one
 * is simply never said. So the store now remembers a day per subject — the daily
 * cap is unchanged, and a subject that spoke goes quiet for a few days while a
 * different one may still speak tomorrow.
 *
 * The old two-field marker has to keep reading. A migration that dropped it would
 * hand a phone that had already spoken today a clean slate, and the first thing the
 * upgrade would do is say something twice.
 */

const day = '2026-08-21';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('what was said, and when', () => {
  it('remembers nothing before anything has been said', async () => {
    expect(await loadSpoken()).toBeNull();
  });

  it('remembers the day and the subject', async () => {
    await noteSpoken('usage', day);
    const spoken = await loadSpoken();
    expect(spoken?.day).toBe(day);
    expect(spoken?.said.usage).toBe(day);
  });

  it('keeps every subject it has spoken, not only the last', async () => {
    await noteSpoken('usage', '2026-08-19');
    await noteSpoken('place', '2026-08-21');
    const spoken = await loadSpoken();
    expect(spoken?.said).toEqual({ usage: '2026-08-19', place: '2026-08-21' });
    // the day of the LAST remark of any subject is what caps one a day
    expect(spoken?.day).toBe('2026-08-21');
  });

  it('reads a marker written before subjects were kept separately', async () => {
    // the shape shipped on 2026-08-21. A phone upgrading mid-morning has already
    // spoken today, and must not be handed a clean slate
    await AsyncStorage.setItem(SPOKEN_KEY, JSON.stringify({ day, about: 'usage' }));
    const spoken = await loadSpoken();
    expect(spoken?.day).toBe(day);
    expect(spoken?.said).toEqual({ usage: day });
  });

  it('reads nothing rather than throwing when the marker is rubbish', async () => {
    await AsyncStorage.setItem(SPOKEN_KEY, '{not json');
    expect(await loadSpoken()).toBeNull();
  });

  it('treats a half-written marker as nothing said', async () => {
    // "spoken today about undefined" would silence him permanently on a subject
    // that has no name
    await AsyncStorage.setItem(SPOKEN_KEY, JSON.stringify({ day }));
    expect(await loadSpoken()).toBeNull();
  });
});

describe('how long a subject stays quiet', () => {
  const spoken = { day, about: 'usage', said: { usage: day } };

  it('is quiet the day after it spoke', () => {
    expect(spokeRecently(spoken, 'usage', new Date(2026, 7, 22), 3)).toBe(true);
  });

  it('is quiet two days after, which is where the old rule stopped', () => {
    expect(spokeRecently(spoken, 'usage', new Date(2026, 7, 23), 3)).toBe(true);
  });

  it('may speak again once the cooldown has passed', () => {
    expect(spokeRecently(spoken, 'usage', new Date(2026, 7, 24), 3)).toBe(false);
  });

  it('never silences a subject that has not spoken', () => {
    expect(spokeRecently(spoken, 'place', new Date(2026, 7, 22), 3)).toBe(false);
  });

  it('says nothing is recent when nothing has ever been said', () => {
    expect(spokeRecently(null, 'usage', new Date(2026, 7, 22), 3)).toBe(false);
  });
});

/**
 * Spending the day's remark budget back, so a remark can be induced.
 *
 * `anticipate-v1` is `untested` for a dull reason: the rebuilt triggers have never
 * spoken on the phone, and one remark a day means a wrong one — or simply an early
 * one — costs a whole day of waiting to see the next. Same shape as the two levers
 * built earlier today: the state is not broken, it is unobservable on demand.
 *
 * It forgets the marker entirely rather than backdating it, because the cooldowns are
 * per subject and a half-cleared marker would silence some subjects and not others,
 * which is a stranger state than either.
 */
describe('clearing the day, to see the next remark now', () => {
  it('lets him speak again today', async () => {
    await noteSpoken('usage', '2026-09-01');
    expect((await loadSpoken())?.day).toBe('2026-09-01');

    await forgetSpoken();
    expect(await loadSpoken()).toBeNull();
  });

  it('clears the per-subject cooldowns with it, rather than half of them', async () => {
    await noteSpoken('place', '2026-08-30');
    await noteSpoken('usage', '2026-09-01');
    await forgetSpoken();
    const spoken = await loadSpoken();
    expect(spokeRecently(spoken, 'place', new Date(2026, 8, 1), 3)).toBe(false);
    expect(spokeRecently(spoken, 'usage', new Date(2026, 8, 1), 3)).toBe(false);
  });

  it('is harmless when nothing has been said', async () => {
    await expect(forgetSpoken()).resolves.toBeUndefined();
  });
});
