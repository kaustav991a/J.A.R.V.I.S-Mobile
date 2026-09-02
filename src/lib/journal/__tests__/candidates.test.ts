import { factCandidates } from '../candidates';
import type { ChatEntry } from '../../../state/hudReducer';

/**
 * What he offers to remember, and what he refuses to notice.
 *
 * **The largest gap in the memory story.** Everything he knows today is about the
 * handset — screen time, pickups, top apps, named places — and the only route from a
 * sentence to a durable fact is typing it into the Memory screen by hand. Meanwhile
 * the chat holds about a day and rolls silently, so what somebody actually said about
 * their life leaves the phone without ever being read.
 *
 * **Nothing here stores anything.** These are candidates, offered on the Memory screen
 * and kept only when ticked. That was the decision on 2026-09-02: not "he decides
 * quietly" — which needs a model reading every sentence — but *he proposes, you
 * approve*, which needs neither a model nor trust.
 */

const you = (text: string, at: number): ChatEntry => ({ from: 'user', text, at });
const him = (text: string, at: number): ChatEntry => ({ from: 'jarvis', text, at });

const NOW = new Date('2026-09-02T13:00:00').getTime();
const said = (text: string) => factCandidates([you(text, NOW - 60_000)], NOW).map((c) => c.text);

describe('sentences worth offering', () => {
  it('offers a fact about a person, which is what the phone can never derive', () => {
    expect(said('my manager is called Rahul')).toEqual(['my manager is called Rahul']);
  });

  it('offers a date, because a date is durable and the app has no other route to one', () => {
    expect(said("my sister's exam is on the 14th")).toHaveLength(1);
  });

  it('offers a place he was told about rather than one he measured', () => {
    expect(said('I work at Sector V')).toHaveLength(1);
  });

  it('offers anything he was explicitly told to remember, whatever its shape', () => {
    expect(said('remember that I hate coriander')).toHaveLength(1);
  });
});

describe('sentences he leaves alone', () => {
  it('ignores a question, which states nothing', () => {
    expect(said('how far is home from here')).toEqual([]);
  });

  it('ignores his own turns, since a fact about you cannot come from him', () => {
    // he says plenty with names and dates in it - forecasts, distances, briefings -
    // and none of it is something you told him about your life
    expect(factCandidates([him('Home is 40.2 km by road from here, Sir.', NOW - 60_000)], NOW)).toEqual([]);
  });

  it('ignores an instruction to the app, which is a command and not a fact', () => {
    expect(said('open whatsapp')).toEqual([]);
  });

  it('never offers a password, however durable it looks', () => {
    // the guard stated when this was designed: a broad catch will meet a secret
    // eventually, and the app already redacts this shape in the crash log
    expect(said('my wifi password is hunter2')).toEqual([]);
  });

  it('never offers a one-time code', () => {
    expect(said('the otp is 448211')).toEqual([]);
  });

  it('says nothing about a sentence with nothing durable in it', () => {
    expect(said('ok')).toEqual([]);
  });
});

describe('what it does with more than one', () => {
  it('offers the newest first, because the oldest is the likeliest to be stale', () => {
    const chat = [
      you('my manager is called Rahul', NOW - 300_000),
      you('I work at Sector V', NOW - 60_000),
    ];
    expect(factCandidates(chat, NOW)[0].text).toBe('I work at Sector V');
  });

  it('offers the same sentence once, however many times it was said', () => {
    const chat = [
      you('my manager is called Rahul', NOW - 300_000),
      you('My manager is called Rahul.', NOW - 60_000),
    ];
    expect(factCandidates(chat, NOW)).toHaveLength(1);
  });

  it('holds a handful at most, so the screen is a decision rather than a list', () => {
    const chat = Array.from({ length: 20 }, (_, i) =>
      you(`my thing number ${i} is called Rahul`, NOW - i * 60_000)
    );
    expect(factCandidates(chat, NOW).length).toBeLessThanOrEqual(8);
  });

  it('forgets a candidate nobody acted on within the week', () => {
    const old = NOW - 8 * 24 * 60 * 60 * 1000;
    expect(factCandidates([you('my manager is called Rahul', old)], NOW)).toEqual([]);
  });
});

describe('what has already been decided', () => {
  it('never offers a sentence you kept, since he already knows it', () => {
    const chat = [you('my manager is called Rahul', NOW - 60_000)];
    expect(factCandidates(chat, NOW, ['my manager is called rahul'])).toEqual([]);
  });

  it('never offers a sentence you dismissed, which is the same gesture as no', () => {
    const chat = [you('I work at Sector V', NOW - 60_000)];
    expect(factCandidates(chat, NOW, ['i work at sector v'])).toEqual([]);
  });
});
