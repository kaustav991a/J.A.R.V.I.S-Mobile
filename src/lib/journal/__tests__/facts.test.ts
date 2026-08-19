import AsyncStorage from '@react-native-async-storage/async-storage';
import { changed, deriveFacts, MIN_DAYS, shareFacts, superseded } from '../facts';
import type { Rollup } from '../rollup';

/**
 * A fact here is not a log line. It goes to the gateway, lands in Postgres, and
 * is read into EVERY system prompt — a standing claim about a person, repeated
 * to a model for as long as it is stored. A wrong one is J.A.R.V.I.S.
 * confidently describing him to himself, daily, until somebody notices.
 */

const roll = (over: Partial<Rollup['usual']> = {}): Rollup => ({
  day: '2026-08-19',
  days: 8,
  today: { ms: 0, pickups: 0, top: [] },
  usual: {
    days: MIN_DAYS,
    avgMs: 5 * 60 * 60_000 + 20 * 60_000,
    avgPickups: 38,
    top: [
      { app: 'com.google.android.gm', ms: 10 },
      { app: 'jp.konami.pesam', ms: 9 },
    ],
    ...over,
  },
  vsUsual: 0,
});

const known = { 'com.google.android.gm': 'Gmail', 'jp.konami.pesam': 'eFootball' };

describe('deciding what is worth asserting', () => {
  it('says nothing at all before a week of days', () => {
    // a habit inferred from two days is a coincidence with a confident voice
    expect(deriveFacts(roll({ days: MIN_DAYS - 1 }), known)).toEqual([]);
  });

  it('says nothing when there is no journal yet', () => {
    expect(deriveFacts(null, known)).toEqual([]);
  });

  it('states the daily average and how many days it rests on', () => {
    const f = deriveFacts(roll(), known);
    const line = f.find((x) => x.key === 'phone:screen-time')?.text ?? '';
    expect(line).toContain('5h 20m');
    // the sample size travels with the claim, so it can be argued with
    expect(line).toContain(`${MIN_DAYS} days`);
  });

  it('names the apps by their real names', () => {
    const line = deriveFacts(roll(), known).find((x) => x.key === 'phone:top-apps')?.text ?? '';
    expect(line).toContain('Gmail');
    expect(line).toContain('eFootball');
    expect(line).not.toContain('com.');
  });

  it('leaves the pickup claim out rather than asserting zero', () => {
    const f = deriveFacts(roll({ avgPickups: 0 }), known);
    expect(f.find((x) => x.key === 'phone:pickups')).toBeUndefined();
  });

  it('copes with only one app worth naming', () => {
    const f = deriveFacts(roll({ top: [{ app: 'com.whatsapp', ms: 5 }] }), known);
    expect(f.find((x) => x.key === 'phone:top-apps')?.text).toContain('The app he uses most is Whatsapp');
  });
});

describe('what actually gets sent', () => {
  it('sends nothing when nothing moved', () => {
    const f = deriveFacts(roll(), known);
    const sent = Object.fromEntries(f.map((x) => [x.key, x.text]));
    expect(changed(f, sent)).toEqual([]);
  });

  it('sends only the claim that changed', () => {
    const before = deriveFacts(roll(), known);
    const sent = Object.fromEntries(before.map((x) => [x.key, x.text]));
    const after = deriveFacts(roll({ avgPickups: 51 }), known);
    const out = changed(after, sent);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('phone:pickups');
  });

  it('sends everything the first time', () => {
    const f = deriveFacts(roll(), known);
    expect(changed(f, {})).toHaveLength(f.length);
  });
});

describe('forgetting what has been replaced', () => {
  /**
   * Without this the prompt accumulates every average he has ever had, and the
   * model is asked to believe all of them at once.
   */
  it('returns the OLD sentence, because that is what the gateway stores', () => {
    const before = deriveFacts(roll(), known);
    const sent = Object.fromEntries(before.map((x) => [x.key, x.text]));
    const after = deriveFacts(roll({ avgPickups: 51 }), known);

    const gone = superseded(after, sent);
    expect(gone).toHaveLength(1);
    expect(gone[0]).toContain('38 times');
  });

  it('forgets nothing when nothing was replaced', () => {
    const f = deriveFacts(roll(), known);
    const sent = Object.fromEntries(f.map((x) => [x.key, x.text]));
    expect(superseded(f, sent)).toEqual([]);
  });

  it('does not forget a claim this run simply had nothing to say about', () => {
    // dropping out of the derivation is not the same as being contradicted, and
    // deleting on absence would erase a fact every time a sync came back thin
    const sent = { 'phone:pickups': 'He picks his phone up around 38 times a day.' };
    expect(superseded([], sent)).toEqual([]);
  });
});

describe('telling the gateway', () => {
  const spy = (over: Partial<{ stored: boolean; rememberThrows: boolean; forgetThrows: boolean }> = {}) => {
    const remembered: string[] = [];
    const forgot: string[] = [];
    return {
      remembered,
      forgot,
      remember: async (fact: string) => {
        if (over.rememberThrows) throw new Error('offline');
        remembered.push(fact);
        return { stored: over.stored ?? true };
      },
      forget: async (fact: string) => {
        if (over.forgetThrows) throw new Error('offline');
        forgot.push(fact);
      },
    };
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('sends every fact the first time and remembers doing so', async () => {
    const s = spy();
    const r = await shareFacts({ rollup: roll(), known, remember: s.remember, forget: s.forget });
    expect(r.sent).toBe(3);
    expect(s.forgot).toEqual([]);

    // and says nothing at all on a second run with the same figures
    const again = await shareFacts({ rollup: roll(), known, remember: s.remember, forget: s.forget });
    expect(again.sent).toBe(0);
    expect(s.remembered).toHaveLength(3);
  });

  it('forgets the old claim before asserting the new one', async () => {
    // of the two half-finished states, "old gone, new not yet" is the one that
    // cannot mislead — two contradictory averages in one prompt is the other
    const s = spy();
    await shareFacts({ rollup: roll(), known, remember: s.remember, forget: s.forget });
    const r = await shareFacts({
      rollup: roll({ avgPickups: 51 }),
      known,
      remember: s.remember,
      forget: s.forget,
    });
    expect(r.forgotten).toBe(1);
    expect(s.forgot[0]).toContain('38 times');
    expect(s.remembered[s.remembered.length - 1]).toContain('51 times');
  });

  /**
   * `stored: false` means the gateway has no DATABASE_URL and the fact dies at
   * its next restart. Recording that in the ledger would mean never saying it
   * again — a fact the assistant believes it has told him and has not.
   */
  it('does not record a fact the gateway admitted it could not keep', async () => {
    const s = spy({ stored: false });
    const first = await shareFacts({ rollup: roll(), known, remember: s.remember, forget: s.forget });
    expect(first.sent).toBe(0);

    const second = await shareFacts({ rollup: roll(), known, remember: s.remember, forget: s.forget });
    expect(s.remembered).toHaveLength(6);
    expect(second.sent).toBe(0);
  });

  it('survives being offline and tries again next time', async () => {
    const dead = spy({ rememberThrows: true });
    const r = await shareFacts({ rollup: roll(), known, remember: dead.remember, forget: dead.forget });
    expect(r.sent).toBe(0);

    const live = spy();
    const after = await shareFacts({ rollup: roll(), known, remember: live.remember, forget: live.forget });
    expect(after.sent).toBe(3);
  });

  it('says nothing before there is a week to speak from', async () => {
    const s = spy();
    const r = await shareFacts({ rollup: roll({ days: 2 }), known, remember: s.remember, forget: s.forget });
    expect(r).toEqual({ sent: 0, forgotten: 0, held: 0 });
    expect(s.remembered).toEqual([]);
  });
});
