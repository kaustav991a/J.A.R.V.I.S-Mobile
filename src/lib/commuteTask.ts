import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
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

    const briefing = await commuteBriefing(at.lat, at.lon, departure, now);
    // silence is an answer: a notification every morning saying "it's fine" is one
    // you stop reading, and then you miss the morning it is not
    if (!briefing) {
      await markBriefed(departure.placeId, today);
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    await postNow({
      title: briefing.title,
      body: briefing.body,
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
  if (!departure) return 'No such departure';

  const at = await coordsFor(departure);
  if (!at) return `Set ${departure.label} on this screen first, or turn on location sharing`;

  const briefing = await commuteBriefing(at.lat, at.lon, departure);
  if (!briefing) return 'Nothing worth warning about in that window';
  await postNow({
    title: briefing.title,
    body: briefing.body,
    channel: GENERAL_CHANNEL,
    data: { kind: 'commute', placeId: departure.placeId },
  });
  return null;
}
