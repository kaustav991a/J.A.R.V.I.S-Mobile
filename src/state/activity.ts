import type { ChatEntry } from './hudReducer';
import type { TraceEntry } from './types';

/**
 * The activity timeline: what was said in either direction and what the agent
 * did, merged into one list, newest first.
 *
 * Built here rather than in the screen because two things read it and they used to
 * disagree. The panel merged `chat` and `trace` its own way and counted
 * `items.length`; the bell counted a different total from the same two arrays. So a
 * bell reading 5 could sit above a panel showing something else, and the header
 * counted messages you had just typed yourself. One builder, one definition of what
 * counts, and the screen is left with nothing but presentation.
 */
export type ActivityItem = {
  /** stable across restarts — the read set is keyed by it */
  id: string;
  at: number;
  from: 'user' | 'jarvis' | 'trace';
  title: string;
  /** '' when the entry has no message of its own, which is allowed */
  detail: string;
};

/**
 * The id for a chat turn.
 *
 * Exported because the provider needs it for entries restored by `hydrate`,
 * without rebuilding the whole timeline to find out what they were called.
 *
 * Built from the side and the timestamp rather than from an array index. An index
 * moves the moment `hydrate` prepends a restored log, and every id in the read set
 * would then point at a different turn — read marks silently sliding onto their
 * neighbours is a bug nobody would report as one.
 */
export const itemId = (c: ChatEntry): string => `${c.from}-${c.at}`;

/** the same, for a trace step. `step` separates two that share a millisecond */
const traceId = (t: TraceEntry): string => `trace-${t.at}-${t.step ?? t.event}`;

export function timeline(chat: ChatEntry[], trace: TraceEntry[]): ActivityItem[] {
  return [
    ...chat.map((c) => ({
      id: itemId(c),
      at: c.at,
      from: c.from,
      title: c.from === 'user' ? 'You sent' : 'Jarvis replied',
      detail: c.text,
    })),
    ...trace.map((t) => ({
      id: traceId(t),
      at: t.at,
      from: 'trace' as const,
      title: t.event,
      detail: t.detail || t.goal,
    })),
  ].sort((a, b) => b.at - a.at);
}

/**
 * The entries a count is allowed to describe.
 *
 * A count says "there is something here you have not seen". You have seen the
 * message you just typed, so counting it put 1 on the bell the instant you pressed
 * send — and an entry with no message has nothing to read, so counting it promises
 * something the panel cannot show. Both stay in the timeline; neither is counted.
 */
export const countable = (items: ActivityItem[]): ActivityItem[] =>
  items.filter((i) => i.from !== 'user' && i.detail !== '');
