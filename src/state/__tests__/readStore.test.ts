import AsyncStorage from '@react-native-async-storage/async-storage';
import { READ_KEEP, loadRead, saveRead } from '../readStore';

/**
 * Which timeline entries have been seen, kept across launches.
 *
 * The panel used to hold one timestamp, baselined at mount, so "read" meant
 * "older than this launch" — reading one entry said nothing about the others and
 * nothing survived a restart. A set of ids is the smaller claim and the honest
 * one: this entry, seen.
 */
beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('the read set', () => {
  it('comes back empty before anything has been read', async () => {
    expect(await loadRead()).toEqual([]);
  });

  it('remembers what was marked read', async () => {
    await saveRead(['jarvis-1755000000000', 'trace-1755000000001-2']);
    expect(await loadRead()).toEqual(['jarvis-1755000000000', 'trace-1755000000001-2']);
  });

  it('keeps the newest when there are more ids than it stores', async () => {
    // the chat log itself is capped, so ids past the cap can never be rendered
    // again — keeping them would grow this key forever for nothing
    const ids = Array.from({ length: READ_KEEP + 20 }, (_, i) => `jarvis-${i}`);
    await saveRead(ids);
    const back = await loadRead();
    expect(back).toHaveLength(READ_KEEP);
    expect(back[back.length - 1]).toBe(`jarvis-${READ_KEEP + 19}`);
  });

  it('drops an entry that is not a string rather than losing the whole set', async () => {
    // this file outlives the code that wrote it; one bad entry must not cost the
    // history and must never reach the provider typed as something it is not
    await AsyncStorage.setItem('jarvis_activity_read', JSON.stringify(['jarvis-1', 7, null, 'trace-2-0']));
    expect(await loadRead()).toEqual(['jarvis-1', 'trace-2-0']);
  });

  it('treats unreadable storage as nothing read, rather than throwing', async () => {
    await AsyncStorage.setItem('jarvis_activity_read', 'not json at all');
    expect(await loadRead()).toEqual([]);
  });

  it('treats a stored shape that is not a list as nothing read', async () => {
    await AsyncStorage.setItem('jarvis_activity_read', JSON.stringify({ seen: true }));
    expect(await loadRead()).toEqual([]);
  });
});
