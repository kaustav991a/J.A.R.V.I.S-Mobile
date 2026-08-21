/**
 * What he can do, and what he cannot do yet.
 *
 * **Answered on the device, never by the model.** Same constraint as
 * `lib/situation.ts` and for a stronger reason: a model asked to list its own
 * features will always find one, and a confidently offered capability that does not
 * exist is the single most expensive kind of wrong answer this app can give — the
 * user goes looking for it, does not find it, and reports a bug against something
 * that was never built. A list in code can only be wrong deliberately.
 *
 * It also means the answer arrives with the desk asleep, the gateway cold and no
 * network at all, which is exactly when someone is most likely to be asking what
 * this thing is for.
 *
 * **`ROADMAP.md` §0b is the authority on what is built.** This file is the phone's
 * copy of the part of it a person would want read aloud. When a feature lands it
 * moves from `PENDING` to `LIVE` here in the same change — a stale entry here is a
 * lie in his voice, which is worse than a stale line in a document.
 */
export type Capability = {
  /** stable, so a screen can key on it and a moved entry keeps its identity */
  id: string;
  /** the short label for a list on screen */
  label: string;
  /** the sentence he says, in his voice. Ends with a full stop */
  line: string;
  /**
   * Where the thing lives, for the Capabilities screen to offer.
   *
   * Absent when there is nowhere to go — the briefing is a notification, not a
   * screen, and a row that navigates nowhere is a row that lies about being
   * tappable.
   */
  where?: { tab: string; screen?: string };
};

/**
 * Ordered by what someone would want to hear first, not by how it was built.
 *
 * The briefing leads because it is the thing that happens without being asked, and
 * that is the property that makes him feel present rather than summoned.
 */
export const LIVE: Capability[] = [
  {
    id: 'briefing',
    label: 'The leaving briefing',
    line: 'I brief you before you leave, with measured figures rather than opinions.',
    where: { tab: 'Settings', screen: 'Places' },
  },
  {
    id: 'chat',
    label: 'Answering here',
    line: 'I answer here, by text or by photograph.',
    where: { tab: 'Chat' },
  },
  {
    id: 'open-app',
    label: 'Opening an app',
    line: 'I can open an app on this phone when you name one.',
  },
  {
    id: 'watch',
    label: 'The desk watch',
    line: 'I watch your desk while you are away, and it locks itself if nobody answers.',
  },
  {
    id: 'memory',
    label: 'One memory',
    line: 'I hold what you tell me, and it is the same memory on the desk, this phone and Telegram.',
    where: { tab: 'Settings', screen: 'Memory' },
  },
  {
    id: 'activity',
    label: 'The record',
    line: 'I keep a record of what was said and what was done, and mark what you have not read.',
    where: { tab: 'Activity' },
  },
  {
    id: 'places',
    label: 'Where you are',
    line: 'I know the places you have named, and answer about distance and weather from them.',
    where: { tab: 'Settings', screen: 'Places' },
  },
  {
    id: 'journal',
    label: 'The journal',
    line: 'I keep a quiet account of how your days are spent, on this device.',
    where: { tab: 'Settings', screen: 'Journal' },
  },
  {
    id: 'desk',
    label: 'The desk itself',
    line: 'When your desk is awake I can reach it — its files, its terminal and its screen.',
    where: { tab: 'Commands' },
  },
];

/**
 * The gaps, named.
 *
 * Kept short on purpose. The rule this codebase has relearned five times is that
 * every state must name itself, and "cannot yet" is a state — but a recital of
 * eight absences reads as an apology, and he does not apologise. Three, and the
 * three a person notices.
 */
export const PENDING: Capability[] = [
  { id: 'voice-out', label: 'Speaking aloud', line: 'I do not speak aloud.' },
  { id: 'scripts-write', label: 'Editing scripts', line: 'I can list your scripts but not yet write or run them.' },
  { id: 'anticipate', label: 'Anticipation', line: 'I do not yet notice a thing before you ask about it.' },
];

/**
 * Whether a message is asking for the whole recital.
 *
 * Deliberately narrow, and each exclusion below is a question that deserves a real
 * answer rather than a list:
 *
 * - **"what can you see"** is about the camera, and belongs to the model.
 * - **"can you lock the desk"** asks about one named thing; answering it with eight
 *   sentences about everything else is not an answer.
 * - **"what can you tell me about X"** is a question about X.
 *
 * A greedy match on "what can you" swallowed all three, which is why the test file
 * pins them.
 */
export function isCapabilityQuestion(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/[?.!]+$/, '');

  // asking about one named thing, or about what he perceives, is not this question
  if (/^(can|could) you\b/.test(t)) return false;
  if (/\bwhat can you (see|hear|read|tell|find)\b/.test(t)) return false;

  return (
    /^what can you do( now| for me| currently)?$/.test(t) ||
    /^what (are your|features do you have)/.test(t) ||
    /^(list|show)( me)? your (capabilities|features)$/.test(t) ||
    /^what (can you do|else can you do)\b/.test(t)
  );
}

/**
 * The answer, assembled.
 *
 * `sir` is spent once and the opening spends it — the rule that holds everywhere in
 * this app's voice. No exclamation marks. A list rather than a paragraph, because
 * eight capabilities in prose is a wall nobody finishes on a phone.
 */
export function capabilityAnswer(): string {
  const does = LIVE.map((c) => `· ${c.line}`).join('\n');
  // a run of sentences rather than a second bulleted list: a recital of absences
  // reads as an apology, and the whole register here is understatement. Each line
  // keeps its own full stop so the same string serves the screen unchanged
  const not = PENDING.map((c) => c.line).join(' ');
  return `At present, sir:\n\n${does}\n\nNot yet: ${not}`;
}
