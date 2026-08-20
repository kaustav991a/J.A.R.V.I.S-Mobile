import { parseRich, plainText } from '../rich';

/**
 * The brain writes markdown and the chat bubble was a plain `<Text>`.
 *
 * Seen on the device 2026-08-20, in a reply that had been sitting in the chat
 * unremarked since 08:29:
 *
 *     • **10 mins**: Warm-up (dynamic stretches, jumping jacks)
 *
 * Punctuation showing, on every list the brain has ever sent. These tests exist
 * for the half of the problem a parser gets wrong rather than the half it gets
 * right: arithmetic that looks like emphasis, a token that has only half
 * arrived, and an accessibility label that must never read markup aloud.
 */
describe('the markdown the brain actually writes', () => {
  const spansOf = (text: string) => {
    const blocks = parseRich(text);
    return blocks.flatMap((b) => (b.kind === 'code' ? [] : b.spans));
  };

  it('reads a bold run as bold and drops its asterisks', () => {
    expect(spansOf('**10 mins**: Warm-up')).toEqual([
      { text: '10 mins', bold: true },
      { text: ': Warm-up' },
    ]);
  });

  it('reads italic', () => {
    expect(spansOf('that is *rather* the point')).toEqual([
      { text: 'that is ' },
      { text: 'rather', italic: true },
      { text: ' the point' },
    ]);
  });

  it('reads inline code, because the brain quotes commands', () => {
    expect(spansOf('run `npm test` first')).toEqual([
      { text: 'run ' },
      { text: 'npm test', code: true },
      { text: ' first' },
    ]);
  });

  /**
   * The trap a greedy regex falls into. `5*3` is arithmetic, and a chat that
   * italicises it has invented a meaning the sender did not write.
   */
  it('leaves arithmetic alone', () => {
    expect(spansOf('5*3 sets')).toEqual([{ text: '5*3 sets' }]);
    expect(spansOf('2 * 3 * 4')).toEqual([{ text: '2 * 3 * 4' }]);
  });

  it('leaves unmatched punctuation as itself', () => {
    expect(spansOf('half a thought *')).toEqual([{ text: 'half a thought *' }]);
    expect(spansOf('**never closed')).toEqual([{ text: '**never closed' }]);
    expect(spansOf('an empty ** pair')).toEqual([{ text: 'an empty ** pair' }]);
  });

  /**
   * `TypeLine` and the typing indicator feed this the same string a token at a
   * time, so every prefix of a valid document has to parse. Throwing here would
   * throw once per frame.
   */
  it('parses every prefix of a reply without throwing', () => {
    const full = 'Right, sir. **35 mins** of `strength`:\n- squats\n- press\n```\nnpm test\n```';
    for (let i = 0; i <= full.length; i += 1) {
      expect(() => parseRich(full.slice(0, i))).not.toThrow();
    }
  });

  it('reads one level of bullets, both markers and numbers', () => {
    const blocks = parseRich('- squats\n* press\n1. cardio');
    expect(blocks.map((b) => b.kind)).toEqual(['bullet', 'bullet', 'bullet']);
    expect(blocks.map((b) => (b.kind === 'bullet' ? b.marker : null))).toEqual(['•', '•', '1.']);
  });

  it('keeps bold inside a bullet', () => {
    const blocks = parseRich('- **10 mins**: warm-up');
    expect(blocks[0]).toEqual({
      kind: 'bullet',
      marker: '•',
      spans: [{ text: '10 mins', bold: true }, { text: ': warm-up' }],
    });
  });

  it('reads a fenced block as one unbroken piece of code', () => {
    const blocks = parseRich('Try:\n```\nadb shell dumpsys jobscheduler\n```');
    expect(blocks[0]).toMatchObject({ kind: 'para' });
    expect(blocks[1]).toEqual({ kind: 'code', text: 'adb shell dumpsys jobscheduler' });
  });

  it('does not treat markup inside a fence as markup', () => {
    const blocks = parseRich('```\nweight = 5*3 and **stars**\n```');
    expect(blocks[0]).toEqual({ kind: 'code', text: 'weight = 5*3 and **stars**' });
  });

  it('treats an unclosed fence as code, since that is what is arriving', () => {
    const blocks = parseRich('```\nnpm test');
    expect(blocks[0]).toEqual({ kind: 'code', text: 'npm test' });
  });

  it('leaves ordinary prose in one span', () => {
    const plain = 'It is 7:16, sir, and the stairs behind you suggest you are moving.';
    expect(spansOf(plain)).toEqual([{ text: plain }]);
  });

  it('survives an empty string', () => {
    expect(parseRich('')).toEqual([]);
    expect(parseRich('   ')).toEqual([]);
  });
});

/**
 * The screen reader reads `entry.text` today (`ChatScreen.tsx:577`). It must go
 * on reading the words and never the markup — reading "star star ten mins star
 * star" aloud would be a regression dressed as a feature.
 */
describe('what the screen reader is given', () => {
  it('strips the markup and keeps the words', () => {
    expect(plainText('**10 mins**: Warm-up')).toBe('10 mins: Warm-up');
    expect(plainText('run `npm test` first')).toBe('run npm test first');
    expect(plainText('that is *rather* the point')).toBe('that is rather the point');
  });

  it('says bullets as lines rather than as symbols', () => {
    expect(plainText('- squats\n- press')).toBe('squats\npress');
  });

  it('keeps arithmetic intact', () => {
    expect(plainText('5*3 sets')).toBe('5*3 sets');
  });

  it('keeps a fenced block readable', () => {
    expect(plainText('Try:\n```\nnpm test\n```')).toBe('Try:\nnpm test');
  });
});
