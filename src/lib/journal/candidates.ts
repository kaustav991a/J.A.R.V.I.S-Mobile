import type { ChatEntry } from '../../state/hudReducer';

/**
 * Sentences he offers to remember, from what you actually said.
 *
 * **The largest gap in the memory story until 2026-09-02.** Everything he knew was
 * about the handset — screen time, pickups, top apps, named places — and the only
 * route from a sentence to a durable fact was typing it into the Memory screen by
 * hand. The chat holds about a day and rolls silently, so what somebody said about
 * their own life left the phone unread.
 *
 * **This proposes; it never stores.** Asked for in that shape deliberately: not "he
 * decides quietly", which needs a model reading every sentence and a great deal of
 * trust, but *he proposes, you approve*. A candidate is a sentence with a tick box
 * next to it, and nothing reaches the gateway until the tick.
 *
 * Harvesting here also fixes the silent half of `chat-window`: a turn becomes a
 * candidate while it is still in the log, so the hundred-entry cap drops a sentence
 * that has already been offered rather than one nobody ever saw.
 */

/** how long an unanswered candidate stays on offer */
export const CANDIDATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** how many are ever shown at once, so the screen is a decision and not a list */
export const CANDIDATE_KEEP = 8;

export type Candidate = {
  /** the sentence as it was said, which is what gets remembered if you tick it */
  text: string;
  /** normalised, and the identity used by the kept-and-dismissed ledger */
  id: string;
  /** when it was said */
  at: number;
};

/**
 * The identity of a sentence, for deciding whether it has been offered before.
 *
 * Case and trailing punctuation are noise: *"my manager is called Rahul"* and *"My
 * manager is called Rahul."* are the same claim, and offering both would be the app
 * failing to notice it had already asked.
 */
export const factId = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Things that must never be offered, whatever else they look like.
 *
 * The catch was chosen broad — *anything durable-looking* — and a broad catch meets a
 * secret eventually. A password is durable, states a fact, and is the last thing that
 * should sit on a screen waiting to be sent anywhere. The same shape the crash log
 * already refuses to write.
 */
const SECRET = /\b(password|passcode|passwd|pin|otp|cvv|secret|token|api[\s-]?key)\b|\b\d{4,}\b/i;

/** a question states nothing, and half of this chat is questions */
const QUESTION = /\?\s*$|^(what|who|when|where|why|how|is|are|do|does|did|can|could|should|would|will)\b/i;

/**
 * Instructions to the app rather than facts about a life.
 *
 * *"open whatsapp"* names an app and could pass for durable, and remembering it would
 * teach him that you are the sort of person who says "open whatsapp" — true, useless,
 * and exactly the noise that makes a memory screen not worth reading.
 */
const COMMAND = /^(open|run|start|stop|play|call|text|send|show|set|turn|close|kill|check)\b/i;

/** said to him on purpose: the one shape that is a fact whatever it contains */
const TOLD = /\b(remember|note|don'?t forget|keep in mind|for future reference)\b/i;

/**
 * Durable-looking: a name, a date, or a place.
 *
 * Capitalised words that are not the first word (a name), numbers with a date's
 * shape, weekday and month names, and the possessive openings that state a standing
 * relationship — *my sister*, *my manager*, *my flat*.
 */
const NAME = /(?!^)\b[A-Z][a-z]{2,}/;
const DATE = /\b(\d{1,2}(st|nd|rd|th)|\d{1,2}[/-]\d{1,2}|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;
const MINE = /\bmy\b|\bi (work|live|am|have|hate|like|prefer|need|use)\b/i;

const durable = (text: string): boolean =>
  TOLD.test(text) || ((NAME.test(text) || DATE.test(text)) && MINE.test(text));

/**
 * What he would offer to remember, newest first.
 *
 * `decided` carries the ids of everything already kept or dismissed — both are
 * answers, and re-asking a question somebody has answered is the behaviour that makes
 * people turn a feature off.
 */
export function factCandidates(
  chat: ChatEntry[],
  now: number = Date.now(),
  decided: string[] = []
): Candidate[] {
  const answered = new Set(decided);
  const seen = new Set<string>();
  const out: Candidate[] = [];

  for (let i = chat.length - 1; i >= 0; i -= 1) {
    const turn = chat[i];
    // his own turns carry names and dates all day - forecasts, distances, briefings -
    // and none of it is something you told him about your life
    if (turn.from !== 'user') continue;
    if (now - turn.at > CANDIDATE_TTL_MS) continue;

    const text = turn.text.trim();
    if (!text || QUESTION.test(text) || COMMAND.test(text) || SECRET.test(text)) continue;
    if (!durable(text)) continue;

    const id = factId(text);
    if (!id || seen.has(id) || answered.has(id)) continue;

    seen.add(id);
    out.push({ text, id, at: turn.at });
    if (out.length === CANDIDATE_KEEP) break;
  }

  return out;
}
