import * as native from '../../../modules/usage-stats';
import type { DailyRow, EventKind, UsageEvent } from './store';

/**
 * The boundary between JARVIS and one Android API.
 *
 * An interface rather than a direct import, because the Kotlin half cannot run
 * under jest — so everything above this file is tested against `fakeSource`, and
 * the native half is verified on the device by checklist and said to be so
 * rather than covered by a green suite and claimed.
 */

export type Grant = 'granted' | 'denied' | 'unavailable';

export interface UsageSource {
  permission(): Promise<Grant>;
  openSettings(): Promise<void>;
  queryDaily(from: number, to: number): Promise<DailyRow[]>;
  queryEvents(from: number, to: number): Promise<UsageEvent[]>;
  /** package name -> the label Android shows; unknown packages map to themselves */
  labels(packages: string[]): Promise<Record<string, string>>;
}

const KINDS: EventKind[] = ['foreground', 'background', 'screen_on', 'screen_off', 'unlock'];
const isKind = (k: string): k is EventKind => (KINDS as string[]).includes(k);

/**
 * Local YYYY-MM-DD, because "which day" is a wall-clock question.
 *
 * The same reasoning as the ask envelope's clock: UTC would put an evening in
 * Kolkata on the following day for four and a half hours out of every twenty-four,
 * and every "what did I do yesterday" after that would be answered off by one.
 */
export const dayKey = (at: number): string => {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const androidSource: UsageSource = {
  async permission() {
    const answer = native.permission();
    return answer === 'granted' || answer === 'denied' ? answer : 'unavailable';
  },
  async openSettings() {
    native.openSettings();
  },
  async queryDaily(from, to) {
    // stamped by the bucket's own end, not by the window asked for: one call
    // spans many days and every row has to land on the day it belongs to
    return (await native.queryDaily(from, to)).map((r) => ({
      day: dayKey(r.end),
      app: r.app,
      ms: r.ms,
    }));
  },
  async labels(packages) {
    return packages.length === 0 ? {} : await native.labels(packages);
  },
  async queryEvents(from, to) {
    // an unrecognised kind is dropped rather than stored as itself: the store's
    // type is a closed set, and a row that satisfies no branch of the digest is
    // weight with no reader
    return (await native.queryEvents(from, to))
      .filter((r) => isKind(r.kind))
      .map((r) => ({ at: r.at, kind: r.kind as EventKind, app: r.app }));
  },
};

/** the stand-in for the native module, for every test above this file */
export function fakeSource(
  seed: Partial<{ grant: Grant; daily: DailyRow[]; events: UsageEvent[]; labels: Record<string, string>; throws: string }> = {}
): UsageSource {
  const boom = () => {
    if (seed.throws) throw new Error(seed.throws);
  };
  return {
    async permission() {
      boom();
      return seed.grant ?? 'granted';
    },
    async openSettings() {
      boom();
    },
    async queryDaily(from, to) {
      boom();
      // the window is honoured, or every watermark test above this passes for
      // the wrong reason — a fake that ignores its arguments proves nothing
      return (seed.daily ?? []).filter((d) => {
        const at = new Date(`${d.day}T12:00:00`).getTime();
        return at >= from && at <= to;
      });
    },
    async queryEvents(from, to) {
      boom();
      return (seed.events ?? []).filter((e) => e.at >= from && e.at <= to);
    },
    async labels(packages) {
      boom();
      // an unknown package maps to itself, which is what the native side does
      return Object.fromEntries(packages.map((p) => [p, seed.labels?.[p] ?? p]));
    },
  };
}
