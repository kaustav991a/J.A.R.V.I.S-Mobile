import { countable, itemId, timeline } from '../activity';
import type { ChatEntry } from '../hudReducer';
import type { TraceEntry } from '../types';

/**
 * The timeline, built once and read by two things that used to disagree.
 *
 * The panel built its own list and the bell counted its own total, so a number on
 * the bell could describe entries the panel did not show. One builder, one
 * definition of what counts.
 */
const chat = (from: 'user' | 'jarvis', text: string, at: number): ChatEntry => ({ from, text, at });

const trace = (event: string, detail: string, at: number, step: number | null = null): TraceEntry => ({
  goal: '',
  event,
  detail,
  step,
  at,
});

describe('the activity timeline', () => {
  it('merges what was said with what was done, newest first', () => {
    const items = timeline([chat('user', 'how far is the office', 100)], [trace('ran', 'ls', 200)]);
    expect(items.map((i) => i.at)).toEqual([200, 100]);
  });

  it('names both sides of the conversation', () => {
    const items = timeline([chat('user', 'ping', 1), chat('jarvis', 'pong', 2)], []);
    expect(items.map((i) => i.title)).toEqual(['Jarvis replied', 'You sent']);
  });

  it('gives every entry an id that survives a restart', () => {
    // the read set is keyed by these, so an id built from an array index would
    // move under it the moment anything was prepended by `hydrate`
    const [only] = timeline([chat('jarvis', 'pong', 1_755_000_000_000)], []);
    expect(only.id).toBe('jarvis-1755000000000');
  });

  it('separates two trace steps that share a millisecond', () => {
    const items = timeline([], [trace('ran', 'a', 5, 1), trace('ran', 'b', 5, 2)]);
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });

  it('falls back to the goal when a step has no detail of its own', () => {
    const items = timeline([], [{ goal: 'tidy the desktop', event: 'planning', detail: '', step: 1, at: 9 }]);
    expect(items[0].detail).toBe('tidy the desktop');
  });

  it('keeps an entry that has no message at all, but leaves it empty', () => {
    // it still happened, so it belongs in the record; it is only the COUNT that
    // must not claim there is something to read
    const items = timeline([], [trace('woke', '', 9)]);
    expect(items).toHaveLength(1);
    expect(items[0].detail).toBe('');
  });
});

describe('what the header is allowed to count', () => {
  it('counts what Jarvis said', () => {
    expect(countable(timeline([chat('jarvis', 'pong', 1)], []))).toHaveLength(1);
  });

  it('does not count the message you just typed', () => {
    // a count says "there is something here you have not seen", and you have seen
    // what you sent. Counting it put 1 on the bell the instant you pressed send
    expect(countable(timeline([chat('user', 'ping', 1)], []))).toHaveLength(0);
  });

  it('does not count an entry with no message', () => {
    expect(countable(timeline([], [trace('woke', '', 9)]))).toHaveLength(0);
  });

  it('counts a step that did carry a message', () => {
    expect(countable(timeline([], [trace('ran', 'ls -la', 9)]))).toHaveLength(1);
  });
});

describe('the id for a stored chat turn', () => {
  it('is the same one the timeline builds, so a restored log stays read', () => {
    expect(itemId(chat('jarvis', 'pong', 42))).toBe('jarvis-42');
  });
});
