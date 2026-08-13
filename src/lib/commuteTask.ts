import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { GENERAL_CHANNEL, postNow } from './notify';
import { alreadyBriefed, briefingDue, commuteBriefing, dayKey, loadCommute, markBriefed } from './commute';
import { currentFix, hasLocation, loadShareLocation } from './place';

/**
 * The morning briefing, run by the system rather than by the app.
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

TaskManager.defineTask(COMMUTE_TASK, async () => {
  try {
    const settings = await loadCommute();
    const now = new Date();
    if (!briefingDue(now, settings)) return BackgroundTask.BackgroundTaskResult.Success;

    const today = dayKey(now);
    // the same umbrella three times teaches you to swipe without reading
    if (await alreadyBriefed(today)) return BackgroundTask.BackgroundTaskResult.Success;

    // no location, no briefing: this needs somewhere to forecast for, and it must
    // not quietly turn into a reason to hold a permission that was switched off
    if (!(await loadShareLocation()) || !(await hasLocation())) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    const fix = await currentFix();
    if (!fix) return BackgroundTask.BackgroundTaskResult.Failed;

    const briefing = await commuteBriefing(fix.lat, fix.lon, settings, now);
    // silence is an answer: a notification every morning saying "it's fine" is one
    // you stop reading, and then you miss the morning it is not
    if (!briefing) {
      await markBriefed(today);
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    await postNow({
      title: briefing.title,
      body: briefing.body,
      channel: GENERAL_CHANNEL,
      data: { kind: 'commute' },
    });
    await markBriefed(today);
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

/** whether the OS is currently prepared to run background work at all */
export async function commuteTaskAvailable(): Promise<boolean> {
  try {
    return (await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available;
  } catch {
    return false;
  }
}

/**
 * Run it now, ignoring the clock and the once-a-day guard.
 *
 * For proving the thing works without waiting on Android's scheduler, and for the
 * "Preview" button in Settings — a briefing you cannot trigger is a briefing you
 * cannot trust.
 */
export async function previewBriefing(): Promise<string | null> {
  const settings = await loadCommute();
  if (!(await loadShareLocation()) || !(await hasLocation())) return 'Location sharing is off';
  const fix = await currentFix();
  if (!fix) return 'No location fix';
  const briefing = await commuteBriefing(fix.lat, fix.lon, settings);
  if (!briefing) return 'Nothing worth warning about in that window';
  await postNow({
    title: briefing.title,
    body: briefing.body,
    channel: GENERAL_CHANNEL,
    data: { kind: 'commute' },
  });
  return null;
}
