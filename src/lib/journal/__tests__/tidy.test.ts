import AsyncStorage from '@react-native-async-storage/async-storage';

import { decidedIds } from '../candidateStore';
import { forgetOne, keepAnyway } from '../tidy';

/**
 * Acting on a fact he offered to forget.
 *
 * Same promise as the keeping side, pointing the other way: **nothing is deleted
 * until it is ticked**, and a fact you chose to keep is never offered up again.
 */

const stale = { fact: 'Kaustav asked about Marco Polo', why: 'A question asked once.' };

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('forgetting one', () => {
  it('asks the gateway to drop exactly the fact it was shown', async () => {
    const forget = jest.fn(async () => ({ facts: [] }));
    await forgetOne(stale, { forget });
    expect(forget).toHaveBeenCalledWith('Kaustav asked about Marco Polo');
  });

  it('reports the facts that are left, so the screen does not have to reload', async () => {
    const out = await forgetOne(stale, { forget: async () => ({ facts: ['a', 'b'] }) });
    expect(out).toEqual({ ok: true, facts: ['a', 'b'] });
  });

  it('says why when the gateway refuses, and leaves the fact where it was', async () => {
    const out = await forgetOne(stale, {
      forget: async () => {
        throw new Error('could not reach the brain');
      },
    });
    expect(out).toEqual({ ok: false, why: 'could not reach the brain' });
  });
});

describe('keeping one he offered to drop', () => {
  it('deletes nothing', async () => {
    const forget = jest.fn();
    await keepAnyway(stale);
    expect(forget).not.toHaveBeenCalled();
  });

  it('never offers that fact again, because the answer was no', async () => {
    await keepAnyway(stale);
    expect(await decidedIds()).toContain('keep:kaustav asked about marco polo');
  });
});
