import AsyncStorage from '@react-native-async-storage/async-storage';

import { decidedIds } from '../candidateStore';
import { dismissFact, keepFact } from '../decide';

/**
 * The two answers, and what each one costs.
 *
 * The whole design rests on one promise: **nothing reaches the gateway until it is
 * ticked.** That is a claim about these two functions, so they are tested here rather
 * than through the screen — the screen only has to call the right one.
 */

const candidate = { text: 'my manager is called Rahul', id: 'my manager is called rahul', at: 1 };

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('keeping one', () => {
  it('sends the sentence as it was said, not the normalised id', async () => {
    // the id is lossy on purpose - lower case, punctuation stripped - and what he
    // remembers should read like the person who said it
    const remember = jest.fn(async () => ({ facts: ['x'], persistent: true, stored: true }));
    await keepFact(candidate, { remember });
    expect(remember).toHaveBeenCalledWith('my manager is called Rahul');
  });

  it('marks it answered, so it is never offered again', async () => {
    await keepFact(candidate, { remember: async () => ({ facts: [], persistent: true, stored: true }) });
    expect(await decidedIds()).toContain('my manager is called rahul');
  });

  it('reports what the gateway said about durability, since held is not kept', async () => {
    const held = await keepFact(candidate, {
      remember: async () => ({ facts: ['x'], persistent: false, stored: false }),
    });
    expect(held).toEqual({ ok: true, stored: false, facts: ['x'] });
  });

  it('leaves it on offer when the gateway refuses, rather than losing it quietly', async () => {
    // a candidate marked answered on a failed send is a sentence nobody can recover:
    // the chat may roll past it before the network comes back
    const out = await keepFact(candidate, {
      remember: async () => {
        throw new Error('no gateway configured');
      },
    });
    expect(out).toEqual({ ok: false, why: 'no gateway configured' });
    expect(await decidedIds()).toEqual([]);
  });
});

describe('dismissing one', () => {
  it('sends nothing anywhere', async () => {
    const remember = jest.fn();
    await dismissFact(candidate);
    expect(remember).not.toHaveBeenCalled();
  });

  it('is as permanent as keeping, because an offer that returns after a no is nagging', async () => {
    await dismissFact(candidate);
    expect(await decidedIds()).toContain('my manager is called rahul');
  });
});
