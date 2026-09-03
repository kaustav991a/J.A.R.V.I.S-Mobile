import AsyncStorage from '@react-native-async-storage/async-storage';
import { openArchive } from '../chatArchive';
import type { Archive } from '../chatArchive';
import type { ChatEntry } from '../hudReducer';
import { clearChat, heldTurns, loadChat, saveChat, useArchive } from '../chatStore';

/**
 * The conversation, kept past the window the phone renders.
 *
 * `CHAT_CAP` is 100 and that is about a day at real pace, so until now the phone
 * forgot a Tuesday on Wednesday. The cap was never the problem — a phone should not
 * render an unbounded list — **losing the turn was.** The desk keeps them; the phone
 * did not.
 *
 * Tested against real SQL in `:memory:`, the way the journal is: the schema, the
 * ignore-on-duplicate and the paging are all genuinely exercised.
 */

const fresh = async (): Promise<Archive> => await openArchive(':memory:');

const turn = (at: number, text: string, from: ChatEntry['from'] = 'user'): ChatEntry => ({
  from,
  text,
  at,
});

describe('keeping turns', () => {
  it('holds a turn it has been given', async () => {
    const a = await fresh();
    await a.archive([turn(1000, 'how far is home')]);
    expect(await a.olderThan(2000, 10)).toEqual([turn(1000, 'how far is home')]);
  });

  it('keeps his turns and yours apart', async () => {
    const a = await fresh();
    await a.archive([turn(1000, 'ask', 'user'), turn(1001, 'answer', 'jarvis')]);
    expect((await a.olderThan(2000, 10)).map((t) => t.from)).toEqual(['user', 'jarvis']);
  });

  it('keeps the photo a turn carried', async () => {
    const a = await fresh();
    await a.archive([{ from: 'user', text: 'Photo', at: 1000, image: 'file:///x.jpg' }]);
    expect((await a.olderThan(2000, 10))[0].image).toBe('file:///x.jpg');
  });

  it('writes the same turn once, however often the window is saved', async () => {
    // saveChat runs on every change and hands over the whole window each time, so
    // the archive sees the same hundred turns again and again
    const a = await fresh();
    await a.archive([turn(1000, 'once')]);
    await a.archive([turn(1000, 'once')]);
    expect(await a.olderThan(2000, 10)).toHaveLength(1);
  });
});

describe('reading them back', () => {
  const many = Array.from({ length: 30 }, (_, i) => turn(1000 + i, `turn ${i}`));

  it('returns the turns just before a moment, oldest first, so they prepend', async () => {
    const a = await fresh();
    await a.archive(many);
    const page = await a.olderThan(1010, 3);
    expect(page.map((t) => t.at)).toEqual([1007, 1008, 1009]);
  });

  it('stops at the beginning rather than inventing a page', async () => {
    const a = await fresh();
    await a.archive([turn(1000, 'first')]);
    expect(await a.olderThan(1000, 10)).toEqual([]);
  });

  it('has nothing to say about an empty archive', async () => {
    expect(await (await fresh()).olderThan(Date.now(), 10)).toEqual([]);
  });

  it('counts what it holds, for a row that has to say so', async () => {
    const a = await fresh();
    await a.archive(many);
    expect(await a.held()).toBe(30);
  });
});

describe('forgetting', () => {
  it('empties, because a log you asked to forget must not survive in a second store', async () => {
    const a = await fresh();
    await a.archive([turn(1000, 'x')]);
    await a.forgetAll();
    expect(await a.held()).toBe(0);
  });

  it('drops one turn, for the same reason a turn can be removed from the log', async () => {
    const a = await fresh();
    await a.archive([turn(1000, 'keep'), turn(1001, 'drop')]);
    await a.forget(1001);
    expect((await a.olderThan(2000, 10)).map((t) => t.text)).toEqual(['keep']);
  });
});

describe('the window and the archive together', () => {
  /**
   * The cap trims; the archive must have seen the turn first.
   *
   * `saveChat` is called on every change and on backgrounding, and it writes the last
   * hundred. A turn that falls out between two saves would be lost forever — so the
   * archiving happens on the way in, before the slice.
   */
  it('keeps a turn the window is about to drop', async () => {
    const a = await fresh();
    const window = Array.from({ length: 120 }, (_, i) => turn(1000 + i, `turn ${i}`));
    await a.archive(window);
    // the store keeps the last hundred; the archive keeps all of them
    expect(await a.held()).toBe(120);
    expect((await a.olderThan(1005, 10)).map((t) => t.at)).toEqual([1000, 1001, 1002, 1003, 1004]);
  });
});

describe('saveChat feeding the archive', () => {
  it('archives every turn it is handed, then trims the window', async () => {
    const a = await fresh();
    useArchive(a);
    const window = Array.from({ length: 120 }, (_, i) => turn(1000 + i, `turn ${i}`));
    await saveChat(window);
    expect(await a.held()).toBe(120);
    expect(await loadChat()).toHaveLength(100);
    useArchive(null);
  });

  it('empties both stores when the conversation is forgotten', async () => {
    const a = await fresh();
    useArchive(a);
    await saveChat([turn(1000, 'x')]);
    await clearChat();
    expect(await a.held()).toBe(0);
    expect(await loadChat()).toEqual([]);
    useArchive(null);
  });

  it('still saves the window when the archive cannot be opened', async () => {
    // the long memory failing must never cost the short one
    useArchive(null);
    await saveChat([turn(1000, 'x')]);
    expect(await loadChat()).toHaveLength(1);
  });
});

describe('the archive arriving late', () => {
  /**
   * The feature shipped on 2026-09-03 and the log was already months old.
   *
   * Without a backfill the archive would start empty while a hundred turns sat in
   * AsyncStorage — so the first thing it can say about the conversation is that it
   * knows nothing about it, over a log the app is rendering at that moment.
   */
  it('takes in the log that already exists', async () => {
    const a = await fresh();
    useArchive(a);
    await saveChat([turn(1000, 'from before the archive existed')]);
    expect(await a.held()).toBe(1);
    useArchive(null);
  });

  it('says how many turns it is holding, so the count can be watched', async () => {
    const a = await fresh();
    useArchive(a);
    await saveChat(Array.from({ length: 12 }, (_, i) => turn(1000 + i, `t${i}`)));
    expect(await heldTurns()).toBe(12);
    useArchive(null);
  });

  it('answers zero rather than throwing when there is no archive', async () => {
    useArchive(null);
    expect(await heldTurns()).toBe(0);
  });
});

describe('backfilling at launch', () => {
  it('archives the log it reads, so a quiet day still keeps what exists', async () => {
    // saveChat only runs when something changes. An app opened and closed without a
    // word would archive nothing, and the turns already in AsyncStorage would stay
    // outside the long memory until the next message
    await AsyncStorage.setItem(
      'jarvis_chat_log',
      JSON.stringify([turn(1000, 'said before the archive existed')])
    );
    const a = await fresh();
    useArchive(a);
    await loadChat();
    expect(await a.held()).toBe(1);
    useArchive(null);
  });
});
