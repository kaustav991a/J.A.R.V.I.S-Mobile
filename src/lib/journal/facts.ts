import AsyncStorage from '@react-native-async-storage/async-storage';
import { appLabel } from './digest';
import type { Rollup } from './rollup';

/**
 * What the phone has learned, said in sentences the brain can carry.
 *
 * This is the point where the journal stops being a private record and starts
 * informing J.A.R.V.I.S. himself. Facts go to the gateway's `/app-fact` route,
 * land in Postgres, and are read into **every system prompt** — so a fact here
 * is not a log line, it is a standing claim about a person, repeated to a model
 * for as long as it is stored.
 *
 * That is why the rules below are conservative to the point of being dull. A
 * wrong fact is not a wrong number on a screen he can ignore; it is J.A.R.V.I.S.
 * confidently describing him to himself, every day, until someone notices.
 */

export type Fact = {
  /**
   * What this fact is ABOUT, stable across value changes.
   *
   * The ledger and the gateway both key on this: a new average supersedes the
   * old one rather than joining it. Without that the prompt accumulates "he
   * averages 4h" and "he averages 6h" side by side, and the model is left to
   * pick.
   */
  key: string;
  /** the sentence itself, as it will be read back in the prompt */
  text: string;
};

/**
 * The floor for saying anything at all.
 *
 * Seven completed days. A habit inferred from two is a coincidence with a
 * confident voice, and this project would rather J.A.R.V.I.S. said nothing than
 * asserted a pattern he had watched twice.
 */
export const MIN_DAYS = 7;

const hoursMinutes = (ms: number): string => {
  const mins = Math.round(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

/**
 * Turn a rollup into standing claims, or into nothing at all.
 *
 * Empty is a perfectly good answer and the common one early on.
 */
export function deriveFacts(r: Rollup | null, known: Record<string, string> = {}): Fact[] {
  if (!r || r.usual.days < MIN_DAYS) return [];

  const facts: Fact[] = [
    {
      key: 'phone:screen-time',
      text: `He spends about ${hoursMinutes(r.usual.avgMs)} a day on his phone, averaged over ${r.usual.days} days.`,
    },
  ];

  if (r.usual.avgPickups > 0) {
    facts.push({
      key: 'phone:pickups',
      text: `He picks his phone up around ${r.usual.avgPickups} times a day.`,
    });
  }

  const top = r.usual.top.slice(0, 2).map((t) => appLabel(t.app, known));
  if (top.length === 2) {
    facts.push({ key: 'phone:top-apps', text: `The apps he uses most are ${top[0]}, then ${top[1]}.` });
  } else if (top.length === 1) {
    facts.push({ key: 'phone:top-apps', text: `The app he uses most is ${top[0]}.` });
  }

  return facts;
}

/**
 * Which facts are worth sending, given what has already been sent.
 *
 * Unchanged facts are not re-sent. The gateway would tolerate it — it dedupes —
 * but every send is a network round trip on a free-tier host, and a phone that
 * re-asserts the same three sentences every few hours is spending someone's
 * quota to say nothing.
 */
export function changed(facts: Fact[], sent: Record<string, string>): Fact[] {
  return facts.filter((f) => sent[f.key] !== f.text);
}

/**
 * The facts that have been superseded and should be forgotten.
 *
 * Returned as the OLD text, because that is what the gateway stores and what
 * `forget` matches on. Without this the prompt fills with every average he has
 * ever had, and the model is asked to believe all of them at once.
 */
export function superseded(facts: Fact[], sent: Record<string, string>): string[] {
  const byKey = new Map(facts.map((f) => [f.key, f.text]));
  return Object.entries(sent)
    .filter(([key, text]) => byKey.has(key) && byKey.get(key) !== text)
    .map(([, text]) => text);
}

/**
 * What has already been told to the gateway, so nothing is repeated.
 *
 * On the phone rather than inferred from the gateway: `/app-fact` will list what
 * it holds, but that list is everything he has ever been told including facts
 * typed by hand on the Memory screen, and the journal has no business deleting
 * those.
 */
const LEDGER_KEY = 'jarvis_fact_ledger';

export async function loadLedger(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === 'string')
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function saveLedger(map: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(map));
  } catch {
    // a ledger that cannot be written costs a repeated fact, not a wrong one
  }
}

export type ShareResult = { sent: number; forgotten: number; held: number };

/**
 * Tell the gateway what changed, and un-tell what it replaced.
 *
 * Forgetting happens FIRST. If a send succeeded and the forget then failed, the
 * prompt would hold two contradictory averages at once — and of the two possible
 * half-finished states, "the old claim is gone and the new one is not there yet"
 * is the one that cannot mislead.
 *
 * `stored: false` means the gateway has no DATABASE_URL and the fact lives only
 * until its next restart. That is NOT recorded in the ledger, so the next run
 * says it again — which is right, because it did not persist.
 */
export async function shareFacts(deps: {
  rollup: Rollup | null;
  known?: Record<string, string>;
  remember(fact: string): Promise<{ stored: boolean }>;
  forget(fact: string): Promise<unknown>;
}): Promise<ShareResult> {
  const facts = deriveFacts(deps.rollup, deps.known ?? {});
  if (facts.length === 0) return { sent: 0, forgotten: 0, held: 0 };

  const ledger = await loadLedger();
  const outgoing = changed(facts, ledger);
  if (outgoing.length === 0) return { sent: 0, forgotten: 0, held: Object.keys(ledger).length };

  let forgotten = 0;
  for (const old of superseded(facts, ledger)) {
    try {
      await deps.forget(old);
      forgotten += 1;
    } catch {
      // a claim that would not delete is still better replaced than doubled
    }
  }

  const next = { ...ledger };
  let sent = 0;
  for (const f of outgoing) {
    try {
      const { stored } = await deps.remember(f.text);
      if (stored) {
        next[f.key] = f.text;
        sent += 1;
      }
    } catch {
      // offline. The ledger is untouched for this key, so it goes again later
    }
  }

  await saveLedger(next);
  return { sent, forgotten, held: Object.keys(next).length };
}
