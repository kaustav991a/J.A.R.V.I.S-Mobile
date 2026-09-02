import AsyncStorage from '@react-native-async-storage/async-storage';

import { decidedIds, forgetDecided, noteDecided } from '../candidateStore';

/**
 * What you have already answered about.
 *
 * A candidate you ticked is now a fact he holds, and a candidate you dismissed is a
 * no. Both are answers, and re-asking a question somebody has answered is the
 * behaviour that gets a feature switched off. The two are stored the same way on
 * purpose: what matters is that the sentence was decided, not which way.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('remembers nothing before anything has been decided', async () => {
  expect(await decidedIds()).toEqual([]);
});

it('holds an id once decided, so the sentence is never offered again', async () => {
  await noteDecided('my manager is called rahul');
  expect(await decidedIds()).toEqual(['my manager is called rahul']);
});

it('does not grow when the same answer is given twice', async () => {
  await noteDecided('i work at sector v');
  await noteDecided('i work at sector v');
  expect(await decidedIds()).toEqual(['i work at sector v']);
});

it('keeps both answers apart from each other', async () => {
  await noteDecided('a');
  await noteDecided('b');
  expect((await decidedIds()).sort()).toEqual(['a', 'b']);
});

it('survives a store that cannot be read, rather than taking the screen down', async () => {
  jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('no'));
  expect(await decidedIds()).toEqual([]);
});

it('can be emptied, which is the only way back for a dismissal', async () => {
  // dismissing is permanent by design; without this there is no way to change your
  // mind about a sentence short of reinstalling the app
  await noteDecided('a');
  await forgetDecided();
  expect(await decidedIds()).toEqual([]);
});
