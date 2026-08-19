import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { openJournal } from './journal/store';
import { androidSource } from './journal/source';
import { syncUsage } from './journal/sync';
import { GENERAL_CHANNEL, postNow } from './notify';
import {
  alreadyBriefed,
  commuteBriefing,
  dayKey,
  dueDeparture,
  loadCommute,
  markBriefed,
} from './commute';
import type { Departure } from './commute';
import { currentFix, hasLocation, loadShareLocation } from './place';
import { loadKnown } from './knownPlaces';

/**
 * The leaving briefing, run by the system rather than by the app.
 *
 * Defined at module scope on purpose: `defineTask` has to have run before the OS
 * can hand work back to a process it just started, so this file is imported for
 * its side effect at startup rather than called from a component.
 *
 * **Android decides when this runs.** The interval is a floor, not a schedule, so
 * the task checks whether a briefing is due rather than assuming it was woken at
 * the right moment — and does nothing at all outside the window.
 */
export const COMMUTE_TASK = 'jarvis-commute-briefing';

/**
 * Where to forecast for.
 *
 * A named place first, and this is the important part: its coordinates are already
 * on the phone, so the common case needs no location read at all. Taking a live
 * fix from a headless task requires `ACCESS_BACKGROUND_LOCATION`, which this app
 * does not declare and does not want — so a briefing that depended on one would
 * fail silently every time, which is a strong candidate for why the first one
 * never arrived.
 *
 * Naming a place is also the better answer on its own terms: at 7 PM the forecast
 * that matters is the office's, and the phone might be anywhere by then.
 */
async function coordsFor(d: Departure): Promise<{ lat: number; lon: number } | null> {
  const named = (await loadKnown()).find((p) => p.id === d.placeId);
  if (named) return { lat: named.lat, lon: named.lon };

  // Nothing named: fall back to asking where the phone is, which needs the live
  // toggle because it is a reading rather than a recollection. It will usually
  // fail in the background, and the settings screen says to name the place.
  if (!(await loadShareLocation()) || !(await hasLocation())) return null;
  const fix = await currentFix();
  return fix ? { lat: fix.lat, lon: fix.lon } : null;
}

TaskManager.defineTask(COMMUTE_TASK, async () => {
  /**
   * The journal rides this schedule rather than asking Android for one of its
   * own.
   *
   * A second background registration competes with the first for the same
   * budget, and between a life-log and a briefing with a deadline the briefing
   * wins every time. Wrapped in its own try so it can never be the reason the
   * briefing did not run — and it costs nothing to skip, because every usage
   * query is retroactive and the next run collects what this one missed.
   */
  try {
    const journal = await openJournal();
    await syncUsage(journal, androidSource, Date.now());
  } catch {
    // the journal never bills the briefing for its failures
  }

  try {
    const settings = await loadCommute();
    const now = new Date();
    const departure = dueDeparture(now, settings);
    if (!departure) return BackgroundTask.BackgroundTaskResult.Success;

    const today = dayKey(now);
    // the same umbrella three times teaches you to swipe without reading — and
    // this is per departure, so the morning cannot silence the evening
    if (await alreadyBriefed(departure.placeId, today)) return BackgroundTask.BackgroundTaskResult.Success;

    const at = await coordsFor(departure);
    if (!at) return BackgroundTask.BackgroundTaskResult.Failed;

    const outcome = await commuteBriefing(at.lat, at.lon, departure, now);

    /**
     * Not knowing must not consume the day.
     *
     * This is where the briefing was actually being lost. The lookup returned null
     * for a failed `fetch` and for a fine morning alike, both fell into the branch
     * below, and `markBriefed` then silenced the departure until tomorrow — when it
     * would fail the same way. On the test phone that failure is the normal case:
     * `dumpsys jobscheduler` reports this uid as
     * `Network: 106 (blocked=REASON_APP_BACKGROUND|REASON_APP_STANDBY)`, so a
     * headless run has no network at all.
     *
     * Returning `Failed` without marking leaves the day open for the next run, and
     * tells Android this attempt did not do its work.
     */
    if (outcome.state === 'unavailable') return BackgroundTask.BackgroundTaskResult.Failed;

    /**
     * Both a warning and an all-clear are posted, and only the failure is silent.
     *
     * This used to return early on `clear` without notifying, because a daily "it's
     * fine" is one you stop reading. Overruled on 2026-08-18: an unremarkable
     * evening produced no notification, which was correct and was still read as the
     * feature being broken — it had been read that way for four days. A briefing you
     * cannot tell apart from a broken briefing is not doing its job.
     *
     * `unavailable` stays silent on purpose. Announcing "all clear" when the lookup
     * failed would be the one genuinely dishonest message this feature could send,
     * and it is also the common case on this phone, whose background network is cut.
     */
    await postNow({
      title: outcome.briefing.title,
      body: outcome.briefing.body,
      channel: GENERAL_CHANNEL,
      data: { kind: 'commute', placeId: departure.placeId },
    });
    await markBriefed(departure.placeId, today);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Ask the system to run the task, or stop asking.
 *
 * 15 minutes is the floor Android accepts; it will honour something much longer in
 * practice, which is why the task re-checks the clock instead of trusting when it
 * was woken.
 */
export async function setCommuteTask(on: boolean): Promise<boolean> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(COMMUTE_TASK);
    if (on && !registered) await BackgroundTask.registerTaskAsync(COMMUTE_TASK, { minimumInterval: 15 });
    if (!on && registered) await BackgroundTask.unregisterTaskAsync(COMMUTE_TASK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bring the registration back in line with the stored setting. Called at launch.
 *
 * The switch on the Places screen was the only thing that ever registered the
 * task, and a registration lives in Android's WorkManager database rather than in
 * this app's storage. A reinstall, a "clear data", or a battery optimiser dropping
 * the work therefore left the switch reading ON with nothing behind it — the worst
 * state available, because the user believes a briefing is coming and no code
 * disagrees.
 *
 * Reading the setting rather than assuming it means this also unregisters a task
 * the user has since switched off, so the two cannot drift apart in either
 * direction. One registration serves every departure; the task picks which.
 */
export async function syncCommuteTask(): Promise<boolean> {
  const { departures } = await loadCommute();
  return setCommuteTask(departures.some((d) => d.on));
}

/** whether the OS is currently prepared to run background work at all */
export async function commuteTaskAvailable(): Promise<boolean> {
  try {
    return (await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available;
  } catch {
    return false;
  }
}

/**
 * Run one departure's briefing now, ignoring the clock, the day and the
 * once-a-day guard.
 *
 * For proving the thing works without waiting on Android's scheduler — a briefing
 * you cannot trigger is a briefing you cannot trust. Returns the reason nothing
 * was posted, or null when one was.
 */
export async function previewBriefing(placeId: string): Promise<string | null> {
  const { departures } = await loadCommute();
  const departure = departures.find((d) => d.placeId === placeId);
  if (!departure) return 'There is no such departure, sir.';

  const at = await coordsFor(departure);
  if (!at) return `I need ${departure.label} named on this screen first, sir — or location sharing turned on.`;

  const outcome = await commuteBriefing(at.lat, at.lon, departure);

  /**
   * The third outcome preview could never show, and the one worth pressing for.
   *
   * "I pressed preview and got nothing" used to mean two different things, and the
   * comment below was written believing there were only two. There are three, and
   * the missing one — the forecast could not be read at all — was being reported as
   * a quiet morning. Said plainly here rather than posted, because a notification
   * claiming nothing to report is the lie this feature kept telling.
   */
  if (outcome.state === 'unavailable') {
    // flat on purpose, and the second of the two places the voice keeps its wit to
    // itself: this line's whole job is admitting he does not know, and a remark
    // attached to it reads as though something was worked out after all
    return `I could not reach the forecast, sir (${outcome.reason}). Nothing was posted, rather than something invented.`;
  }

  /**
   * Preview posts whatever the real thing would have posted, which is now both cases.
   *
   * It used to word the quiet case differently — "A real briefing would have stayed
   * quiet" — because the scheduled one was silent then and the preview had to explain
   * the difference. Since the quiet day is announced too, that explanation would be
   * describing behaviour the app no longer has, so preview shows the same text a real
   * briefing sends. What it proves is unchanged: the channel, the permission and the
   * delivery, end to end, without waiting on Android's scheduler.
   */
  await postNow({
    title: outcome.briefing.title,
    body: outcome.briefing.body,
    channel: GENERAL_CHANNEL,
    data: { kind: 'commute', placeId: departure.placeId, preview: true },
  });
  return null;
}
