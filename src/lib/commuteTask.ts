import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { openJournal } from './journal/store';
import { androidSource } from './journal/source';
import { syncUsage } from './journal/sync';
import { rollup } from './journal/rollup';
import { shareFacts } from './journal/facts';
import { loadEndpoints, loadToken } from './../link/config';
import { createApi } from './../api/client';
import { GENERAL_CHANNEL, postNow } from './notify';
import {
  alreadyBriefed,
  cloudArmed,
  commuteBriefing,
  dayKey,
  dueDeparture,
  loadCommute,
  markBriefed,
} from './commute';
import type { Departure } from './commute';
import { currentFix, hasLocation, loadShareLocation } from './place';
import { healthFrom, noteRun, readHeartbeat } from './taskHealth';
import type { HealthReading } from './taskHealth';
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


/**
 * Collect and share, after the briefing has had the time it needs.
 *
 * Every exit from the task runs this, and it can never change what the task
 * reports: a journal failure is not a briefing failure.
 */
async function catchUpJournal(): Promise<void> {
  try {
    const journal = await openJournal();
    const at = Date.now();
    await syncUsage(journal, androidSource, at);

    const endpoints = await loadEndpoints();
    const token = await loadToken();
    const api = createApi({
      baseUrl: endpoints.cloudBase ?? endpoints.deskBase,
      cloudUrl: endpoints.cloudBase,
      token,
    });
    await shareFacts({
      rollup: await rollup(journal, at),
      known: await journal.allLabels(),
      remember: (fact) => api.remember(fact),
      forget: (fact) => api.forget(fact),
    });
  } catch {
    // the journal never bills the briefing for its failures
  }
}

TaskManager.defineTask(COMMUTE_TASK, async () => {
  /**
   * The briefing goes FIRST, and the journal waits its turn.
   *
   * It was the other way round for a few hours, and Android noticed:
   * `dumpsys jobscheduler` reported this app at 13 timeouts in a day against
   * limits of 3 and 10, which quota-throttles the task — so the briefing would
   * have stopped running at all. A first journal sync writes some seventeen
   * thousand rows, and a headless task does not have that kind of time.
   *
   * Wrapping the journal so it could not FAIL the briefing was not enough: it
   * could still spend the whole budget before the briefing began. Order is the
   * fix. The thing with a deadline goes first, and the journal takes whatever
   * is left — which costs it nothing, because every usage query is retroactive
   * and the next run collects what this one missed.
   */


  try {
    const settings = await loadCommute();
    const now = new Date();
    const departure = dueDeparture(now, settings);
    if (!departure) {
      // the ordinary wake, and the one that proves the task is alive at all — a phone
      // where only this branch ever fires is a healthy task with nothing to do
      await noteRun('idle');
      await catchUpJournal();
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const today = dayKey(now);
    // the same umbrella three times teaches you to swipe without reading — and
    // this is per departure, so the morning cannot silence the evening
    if (await alreadyBriefed(departure.placeId, today)) {
      await noteRun('idle');
      await catchUpJournal();
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    /**
     * The gateway is briefing, so this task must not.
     *
     * Checked BEFORE the forecast, because a lookup this run is not allowed to post
     * is a lookup spent out of a headless task's budget for nothing.
     *
     * This is what makes the phone a real fallback rather than a second sender. On
     * 2026-08-21 both fired and the same briefing arrived twice — see `cloudArmed`
     * for why the stale case resolves toward posting rather than toward silence.
     */
    if (await cloudArmed(now)) {
      await noteRun('stood-down');
      await catchUpJournal();
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const at = await coordsFor(departure);
    if (!at) {
      await noteRun('failed');
      return BackgroundTask.BackgroundTaskResult.Failed;
    }

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
    if (outcome.state === 'unavailable') {
      // the common case on this phone, whose background network is cut — and the
      // reading that separates "throttled, never wakes" from "wakes and cannot reach
      // the forecast", which used to look identical from outside
      await noteRun('failed');
      return BackgroundTask.BackgroundTaskResult.Failed;
    }

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
    await noteRun('briefed');
    await catchUpJournal();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // it woke and fell over. Recorded, because a task that throws every time looks
    // exactly like a task that never runs unless something says otherwise
    await noteRun('failed');
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
/**
 * Whether Android currently holds a registration for the briefing.
 *
 * Separate from `commuteTaskAvailable`, which answers whether background work is
 * permitted at all. The two disagree often enough to matter: permitted-and-not-
 * registered is a switch that is off, and registered-and-permitted-but-never-run is
 * throttling. Only asking both can tell them apart.
 */
export async function commuteTaskRegistered(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(COMMUTE_TASK);
  } catch {
    return false;
  }
}

/**
 * The one reading worth putting on a screen.
 *
 * Composed here rather than in the screen so the three facts are always gathered
 * together — a screen that read availability without the heartbeat is exactly the
 * screen that spent four days reporting a healthy task that had not run.
 */
export async function commuteTaskHealth(now: number = Date.now()): Promise<HealthReading> {
  const [settings, registered, available, beat] = await Promise.all([
    loadCommute(),
    commuteTaskRegistered(),
    commuteTaskAvailable(),
    readHeartbeat(),
  ]);
  // what was asked for, read separately from what Android is holding — the two
  // disagreeing is the whole reason this reading exists
  const wanted = settings.departures.some((d) => d.on);
  return healthFrom({ wanted, registered, available, beat, now });
}

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
