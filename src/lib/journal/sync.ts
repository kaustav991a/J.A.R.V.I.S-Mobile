import type { Journal } from './store';
import type { UsageSource } from './source';

/**
 * Pull whatever is new into the journal.
 *
 * Called from the foreground, from the background task that already runs the
 * commute briefing, and from a button on the Journal screen. No service, no
 * scheduler of its own, no foreground notification — because the collector can
 * afford to be lazy: **Android is the buffer.** Every query here is retroactive
 * inside its retention window, so a missed run costs nothing at all.
 *
 * The window is the limit of that generosity, and it is about **seven days for
 * both halves** — events and daily buckets alike. An app left unopened longer
 * than that loses the days beyond it permanently, because Android has discarded
 * its own copy and no later sync can go back for them. Which is the argument for
 * the background leg of this: it is not an optimisation, it is what stops a week
 * away from being a week erased.
 *
 * That property is why this feature costs the phone no battery: nothing is
 * collected here. The system records this whether an app asks or not, and these
 * calls only read what it has already written.
 */

export type SyncResult =
  | { state: 'ok'; events: number; daily: number }
  | { state: 'denied' }
  | { state: 'error'; problem: string };

/** windows overlap, so an event on a boundary is never dropped between runs */
export const OVERLAP_MS = 5 * 60_000;

/** Android keeps roughly seven days of events; ask for all of it the first time */
export const FIRST_RUN_EVENT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Two years asked for, about one week expected.
 *
 * Android retains daily buckets for roughly seven days; the longer windows it
 * keeps (4 weeks, 6 months, 2 years) are weekly, monthly and yearly aggregates,
 * none of them per-day. The generous request costs nothing and takes whatever a
 * given phone happens to hold — but a first launch is a WEEK of history, not
 * months, and the depth after that comes from the journal keeping what Android
 * drops.
 */
export const FIRST_RUN_DAILY_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const since = async (j: Journal, source: string, now: number, firstRun: number): Promise<number> => {
  const mark = await j.watermark(source);
  return mark === null ? now - firstRun : Math.max(0, mark - OVERLAP_MS);
};

export async function syncUsage(j: Journal, source: UsageSource, now: number): Promise<SyncResult> {
  try {
    // Asked every time rather than cached. This permission is granted and
    // revoked by hand in a Settings screen, and the app is never told either
    // way — a remembered answer is a claim about the past.
    if ((await source.permission()) !== 'granted') return { state: 'denied' };

    const eventsFrom = await since(j, 'events', now, FIRST_RUN_EVENT_MS);
    const dailyFrom = await since(j, 'daily', now, FIRST_RUN_DAILY_MS);

    const [events, daily] = await Promise.all([
      source.queryEvents(eventsFrom, now),
      source.queryDaily(dailyFrom, now),
    ]);

    const wroteEvents = await j.putEvents(events);
    const wroteDaily = await j.putDaily(daily);

    /**
     * Ask what the new packages are called, once each, ever.
     *
     * Only the ones this journal has never seen: labels do not change, the call
     * touches `PackageManager` per package, and a first sync carries a couple of
     * hundred of them. Everything after that asks about the handful you have
     * installed since.
     */
    const seen = await j.allLabels();
    const fresh = [...new Set([...daily.map((d) => d.app), ...events.map((e) => e.app)])].filter(
      (a): a is string => typeof a === 'string' && a !== '' && !(a in seen)
    );
    if (fresh.length) await j.putLabels(await source.labels(fresh));

    /**
     * The watermarks move only after the writes succeeded.
     *
     * Advancing them first would turn one failed sync into a permanent hole:
     * the window is never asked for again, and nothing downstream can tell that
     * anything is missing. A gap you can see is a bug; a gap you cannot is a
     * lie the data tells for the rest of its life.
     */
    await j.setWatermark('events', now);
    await j.setWatermark('daily', now);
    await j.prune(now);

    return { state: 'ok', events: wroteEvents, daily: wroteDaily };
  } catch (e) {
    return { state: 'error', problem: e instanceof Error ? e.message : 'unknown' };
  }
}
