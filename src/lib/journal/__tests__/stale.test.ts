import { staleFacts } from '../stale';

/**
 * Facts worth forgetting, offered the same way facts worth keeping are.
 *
 * **The complaint that produced this, 2026-09-02:** *"all that i tell him will go to
 * the memory?? thats not feasable"*. Nineteen facts on the phone, several of them
 * junk — *"Kaustav asked about Marco Polo"*, *"Kaustav is currently in Ichapur"* — and
 * the Memory screen says the cost out loud: they ride along on every single reply.
 *
 * Nothing here deletes anything. It proposes, and the same rule holds as for keeping:
 * you tick what goes.
 */

const reasons = (facts: string[]) => staleFacts(facts).map((s) => `${s.fact} :: ${s.why}`);

describe('what is worth forgetting', () => {
  it('proposes a question somebody asked once, which was never a fact about them', () => {
    const [only] = staleFacts(['Kaustav asked about Marco Polo']);
    expect(only.fact).toBe('Kaustav asked about Marco Polo');
    expect(only.why).toMatch(/once|question|passing/i);
  });

  it('proposes where he is right now, because it is true for an hour', () => {
    const [only] = staleFacts(['Kaustav is currently in Ichapur, West Bengal, India']);
    expect(only.why).toMatch(/moves|measure|now/i);
  });

  it('proposes today and this morning, which are stale by tomorrow', () => {
    expect(staleFacts(['Kaustav is working from home today'])).toHaveLength(1);
  });

  it('leaves a standing fact about a person alone', () => {
    expect(staleFacts(["Kaustav's father is Tapas"])).toEqual([]);
  });

  it('leaves a standing fact about work alone', () => {
    expect(staleFacts(['Kaustav works Monday to Friday, and occasionally a Saturday'])).toEqual([]);
  });

  it('leaves a date that will still be a date next year', () => {
    expect(staleFacts(['Kaustav had a dog called Puku, who died on 5 August 2025'])).toEqual([]);
  });
});

describe('the same thing said twice', () => {
  it('proposes the later of two facts that say the same thing', () => {
    // the gateway wrote its own paraphrase the moment the sentence was sent, and the
    // phone then offered the sentence itself: one fact, two entries, both paid for on
    // every reply
    const found = staleFacts([
      "Kaustav's manager at Fortmindz is called Rahul",
      'my manager is called Rahul',
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].fact).toBe('my manager is called Rahul');
    expect(found[0].why).toMatch(/same|already|duplicate/i);
  });

  it('keeps two facts that merely share a name', () => {
    expect(
      staleFacts(['Kaustav has a dog called Kitty', 'Kaustav had a dog called Puku'])
    ).toEqual([]);
  });
});

describe('what it refuses to touch', () => {
  it('proposes nothing at all from an empty memory', () => {
    expect(staleFacts([])).toEqual([]);
  });

  it('never proposes everything, since a memory emptied by one tap is a mistake', () => {
    const many = [
      'Kaustav asked about Marco Polo',
      'Kaustav is currently in Ichapur',
      'Kaustav is working from home today',
      "Kaustav's father is Tapas",
    ];
    expect(staleFacts(many).length).toBeLessThan(many.length);
  });

  it('says why for every one, because a reason is what makes it a decision', () => {
    for (const line of reasons(['Kaustav asked about Marco Polo', 'Kaustav is currently in Delhi'])) {
      expect(line.split(' :: ')[1]?.length ?? 0).toBeGreaterThan(10);
    }
  });
});
