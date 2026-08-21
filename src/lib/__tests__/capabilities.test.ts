import { LIVE, PENDING, capabilityAnswer, isCapabilityQuestion } from '../capabilities';

/**
 * What he says when asked what he can do.
 *
 * Answered on the device rather than by the model, for the same reason the opening
 * greeting is: a model asked to list its own features will invent one, and a
 * confidently offered capability that does not exist is worse than no answer. This
 * list is code, so it can only be wrong deliberately.
 */

describe('recognising the question', () => {
  it('answers the plain forms of it', () => {
    for (const q of [
      'what can you do',
      'What can you do?',
      'what can you do now',
      'what are your features',
      'what features do you have',
      'list your capabilities',
      'what can you do for me',
    ]) {
      expect(isCapabilityQuestion(q)).toBe(true);
    }
  });

  it('leaves an ordinary command alone', () => {
    for (const q of ['lock the desk', 'is it raining here', 'how far is the office']) {
      expect(isCapabilityQuestion(q)).toBe(false);
    }
  });

  it('leaves a question about what he can SEE alone', () => {
    // "what can you see" is a real question about the camera and belongs to the
    // model. A greedy "what can you" match would have swallowed it
    expect(isCapabilityQuestion('what can you see in this photo')).toBe(false);
    expect(isCapabilityQuestion('what can you see')).toBe(false);
  });

  it('leaves a question about a specific thing alone', () => {
    // asking whether he can do one named thing wants a real answer about that
    // thing, not the whole recital
    expect(isCapabilityQuestion('can you lock the desk')).toBe(false);
    expect(isCapabilityQuestion('what can you tell me about Kolkata')).toBe(false);
  });
});

describe('the answer', () => {
  const said = capabilityAnswer();

  it('names what he can do now', () => {
    expect(said).toContain(LIVE[0].line);
  });

  it('names what he cannot do yet, so nothing is hunted for that was never built', () => {
    expect(said.toLowerCase()).toContain('not yet');
    expect(said).toContain(PENDING[0].line);
  });

  it('spends `sir` exactly once, and the opening spends it', () => {
    // punctuation, not deference: repeated in every clause it stops reading as dry
    // and starts reading as servile, which is a different character
    expect(said.match(/\bsir\b/gi) ?? []).toHaveLength(1);
  });

  it('has no exclamation marks, because understatement is the whole instrument', () => {
    expect(said).not.toContain('!');
  });

  it('is a list, not a paragraph', () => {
    // read half-awake on a phone: a wall of prose describing eight capabilities is
    // one nobody finishes
    expect(said.split('\n').filter((l) => l.startsWith('· ')).length).toBeGreaterThan(3);
  });
});

describe('the list itself', () => {
  it('says something on every line', () => {
    for (const c of [...LIVE, ...PENDING]) {
      expect(c.line.length).toBeGreaterThan(10);
      expect(c.line.endsWith('.')).toBe(true);
    }
  });

  it('gives every entry a stable id, so a screen can key on it', () => {
    const ids = [...LIVE, ...PENDING].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never claims a capability twice', () => {
    const live = new Set(LIVE.map((c) => c.id));
    expect(PENDING.some((c) => live.has(c.id))).toBe(false);
  });
});
