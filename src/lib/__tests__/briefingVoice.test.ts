import AsyncStorage from '@react-native-async-storage/async-storage';
import { REMARKS, TITLES, openVoice, voiceFrom } from '../briefingVoice';
import type { Slot, TitleKind } from '../briefingVoice';

/**
 * The wording rotates, and every line in the table obeys the voice.
 *
 * The second half is the more valuable one. A pool of variants is a pool of places
 * for a rule to be broken quietly: one line in six with an exclamation mark in it
 * is a briefing that reads wrong one morning in six, and no test that samples a
 * single rendering would ever catch it. So the rules are asserted over the **whole
 * table**, not over whatever came out today.
 */

const slots = Object.keys(REMARKS) as Slot[];
const kinds = Object.keys(TITLES) as TitleKind[];
const every = slots.flatMap((s) => REMARKS[s].map((line) => ({ slot: s, line })));

describe('every line in the table', () => {
  /**
   * The four voice rules live above `notes` in `commute.ts`. These are the two that
   * a new variant can break without anyone noticing.
   */
  it('never exclaims, because understatement is the whole instrument', () => {
    const shouting = every.filter(({ line }) => line.includes('!'));
    expect(shouting).toEqual([]);
  });

  it('never says “sir” in a remark, because the title already spends the one', () => {
    // repeated in every clause it stops reading as dry and starts reading as
    // servile, which is a different character than the one that was asked for
    const servile = every.filter(({ line }) => /\bsirs?\b/i.test(line));
    expect(servile).toEqual([]);
  });

  /**
   * The instruction survives every variant, which is the rule that makes rotation
   * safe rather than merely pleasant.
   *
   * Android truncates a body in the shade. A variant that kept the joke and dropped
   * the word `umbrella` would pass every other test in this file and fail the person
   * reading it in a doorway — one morning in six, unreproducibly.
   */
  const carries: Array<{ slot: Slot; word: RegExp }> = [
    { slot: 'rain', word: /umbrella/i },
    { slot: 'hot', word: /water/i },
    { slot: 'cold', word: /jacket/i },
    { slot: 'wind', word: /hair/i },
    { slot: 'storm', word: /leave early or wait it out/i },
  ];

  for (const { slot, word } of carries) {
    it(`keeps the actionable word in all ${REMARKS[slot].length} ${slot} lines`, () => {
      const missing = REMARKS[slot].filter((line) => !word.test(line));
      expect(missing).toEqual([]);
    });
  }

  it('names the place in every title, since two arrive in a day', () => {
    // a shade holding both the morning and the evening has to say which door each
    // one is about — the original reason the label went into the title
    const unnamed = kinds.flatMap((k) =>
      TITLES[k].map((f) => f('Office')).filter((t) => !t.includes('Office'))
    );
    expect(unnamed).toEqual([]);
  });

  it('spends the one “sir” in every title, so no message is left without it', () => {
    const missing = kinds.flatMap((k) => TITLES[k].map((f) => f('Home')).filter((t) => !t.includes('sir')));
    expect(missing).toEqual([]);
  });

  it('has more than one of everything, or there is nothing to rotate', () => {
    for (const s of slots) expect(REMARKS[s].length).toBeGreaterThan(1);
    for (const k of kinds) expect(TITLES[k].length).toBeGreaterThan(1);
  });

  it('repeats no line within a slot, which a copy-paste variant would', () => {
    for (const s of slots) expect(new Set(REMARKS[s]).size).toBe(REMARKS[s].length);
    for (const k of kinds) {
      const rendered = TITLES[k].map((f) => f('Home'));
      expect(new Set(rendered).size).toBe(rendered.length);
    }
  });
});

describe('the rotation', () => {
  it('spends the whole pool before any line comes round again', () => {
    // the actual complaint was repetition, so this is the assertion the feature
    // exists to satisfy: no line twice until every line has been used once
    const v = voiceFrom({});
    const drawn = REMARKS.rain.map(() => v.remark('rain'));

    expect(new Set(drawn).size).toBe(REMARKS.rain.length);
    expect(drawn).toEqual([...REMARKS.rain]);
  });

  it('comes back to the first line only after the last, and in order', () => {
    const v = voiceFrom({});
    REMARKS.cold.forEach(() => v.remark('cold'));

    expect(v.remark('cold')).toBe(REMARKS.cold[0]);
  });

  it('resumes where the last briefing stopped rather than starting over', () => {
    // the cursor is the whole point: a fresh session each morning that began at zero
    // would say the same thing every day, which is the bug
    expect(voiceFrom({ rain: 2 }).remark('rain')).toBe(REMARKS.rain[2]);
  });

  it('keeps a cursor per slot, so rain does not advance the jacket', () => {
    const v = voiceFrom({});
    v.remark('rain');
    v.remark('rain');

    expect(v.remark('cold')).toBe(REMARKS.cold[0]);
  });

  /**
   * The two briefings in a day are the two most likely to be compared, because they
   * arrive hours apart on the same phone. One cursor across both is what makes the
   * evening differ from the morning.
   */
  it('gives the evening a different line from the morning', () => {
    const v = voiceFrom({});

    expect(v.title('warn', 'Home')).not.toBe(v.title('warn', 'Office').replace('Office', 'Home'));
  });

  it('starts from the beginning when nothing has been stored yet', () => {
    expect(voiceFrom({}).title('clear', 'Home')).toBe(TITLES.clear[0]('Home'));
  });

  /**
   * A stored cursor is data from a previous version of this app, so it can be
   * anything at all — including a number that no longer indexes a shortened pool.
   */
  it('survives a cursor past the end of a pool that has since shrunk', () => {
    expect(voiceFrom({ wind: 999 }).remark('wind')).toBe(REMARKS.wind[999 % REMARKS.wind.length]);
  });

  it('survives a cursor that is not a number at all', () => {
    // `NaN` would index nothing and print `undefined` on a lock screen, which is the
    // one outcome worse than a repeated line
    const v = voiceFrom({ rain: 'yesterday' as unknown as number });

    expect(v.remark('rain')).toBe(REMARKS.rain[0]);
  });

  it('survives a negative cursor', () => {
    expect(voiceFrom({ hot: -3 }).remark('hot')).toBe(REMARKS.hot[0]);
  });
});

describe('the stored cursor', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('is written once, carrying every slot that was drawn', async () => {
    const v = await openVoice();
    v.remark('rain');
    v.remark('rain');
    v.title('warn', 'Home');
    await v.commit();

    const raw = await AsyncStorage.getItem('jarvis_briefing_voice');
    expect(JSON.parse(raw ?? '{}')).toEqual({ rain: 2, 'title:warn': 1 });
  });

  it('is read back, so tomorrow continues today’s rotation', async () => {
    const first = await openVoice();
    const said = first.remark('cold');
    await first.commit();

    const second = await openVoice();
    expect(second.remark('cold')).not.toBe(said);
  });

  it('starts from the beginning when the store holds nonsense', async () => {
    await AsyncStorage.setItem('jarvis_briefing_voice', 'not json');

    const v = await openVoice();
    expect(v.remark('rain')).toBe(REMARKS.rain[0]);
  });

  /**
   * A cursor that cannot be saved costs one repeated line. A briefing that does not
   * arrive costs the morning, and this must never be the reason for the second.
   */
  it('does not fail the briefing when storage refuses to write', async () => {
    const spy = jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValue(new Error('no space left on device'));

    try {
      const v = await openVoice();
      v.remark('rain');
      await expect(v.commit()).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('does not fail the briefing when storage refuses to read', async () => {
    const spy = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('unavailable'));

    try {
      const v = await openVoice();
      expect(v.remark('rain')).toBe(REMARKS.rain[0]);
    } finally {
      spy.mockRestore();
    }
  });
});
