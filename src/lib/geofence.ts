import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { AT_PLACE_KM } from './knownPlaces';
import type { KnownPlace } from './knownPlaces';
import { noteSeen } from './timeline';

/**
 * Sightings that happen whether or not anybody is holding the phone.
 *
 * **Why this exists, in three figures the app got wrong on 2026-09-01.** *"At Home
 * early, sir — usually you are there by 10:49 AM"*, said to somebody who had been home
 * all night. *"When you are usually gone — 3:40 PM"* about an office he leaves at
 * seven. And the repair, *"by 8:04 PM"*, which is when he is next SEEN at Home and
 * still not a departure. Each was narrowed until it was true, and the third is the end
 * of that road: what was left to narrow was the sentence, not the data.
 *
 * Every one of those came from the same root. A sighting was written when the app
 * happened to be opened, so the store held *when he used his phone at a place*, and
 * every habit derived from it inherited that. A geofence exit is the real event:
 * Android reports the boundary being crossed with the app closed, a couple of minutes
 * late rather than hours.
 *
 * **Asked for directly** — *"the app should learn it itself, Google Maps Timeline has
 * all the data"*. It does, and there is no route to it: Timeline moved on-device,
 * no API exposes it to another app, and a Takeout export is a manual download that is
 * stale the moment it is made. Maps knows because it holds background location. This
 * is the same permission doing the same job, for one app's own named places.
 *
 * **Nothing here runs until the next APK.** Geofencing needs
 * `ACCESS_BACKGROUND_LOCATION` in the manifest, and the manifest is a fingerprint
 * input — changing `app.json` moves the OTA runtime and every publish after it reaches
 * a runtime no installed app has. So the code lands now and the permission lands with
 * the build (queue 23); `startWatchingPlaces` refuses politely until then.
 */

/** Android remembers this across launches; renaming it orphans a live registration */
export const GEOFENCE_TASK = 'jarvis-place-geofence';

/**
 * How wide a circle Android is asked to watch.
 *
 * The naming radius is 120 m and this is deliberately no tighter: below about a
 * hundred metres the platform reports crossings that never happened, because it is
 * fusing wifi and cell rather than holding a GPS fix. A false departure every lunchtime
 * would be worse than the app-open bias this replaces.
 */
export const GEOFENCE_RADIUS_M = Math.max(120, AT_PLACE_KM * 1000);

export type Region = {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
};

/** one circle per named place, watching both crossings */
export function geofenceRegions(places: KnownPlace[]): Region[] {
  return places.map((p) => ({
    identifier: p.label,
    latitude: p.lat,
    longitude: p.lon,
    radius: GEOFENCE_RADIUS_M,
    // the exit is the point — it is the only departure this app can ever measure —
    // and the entry is the arrival it could never see either
    notifyOnEnter: true,
    notifyOnExit: true,
  }));
}

type GeofenceEvent = {
  eventType?: unknown;
  region?: { identifier?: unknown } | null;
} | null;

/**
 * Write what the crossing said.
 *
 * Separate from the task registration so it can be tested without the permission, and
 * because this body runs with the app closed: **it may not throw.** A crash here is a
 * crash nobody sees, and the sighting is lost silently — which is the failure this
 * whole file exists to stop happening by accident.
 */
export async function onGeofenceEvent(event: GeofenceEvent, at: number = Date.now()): Promise<void> {
  try {
    const kind = event?.eventType;
    const label = event?.region?.identifier;
    if (typeof label !== 'string' || !label) return;

    // `Location.GeofencingEventType` is an enum on the device and a string in the
    // harness; both shapes are accepted rather than one being assumed
    const entering = kind === 'enter' || kind === Location.GeofencingEventType.Enter;
    const leaving = kind === 'exit' || kind === Location.GeofencingEventType.Exit;
    if (!entering && !leaving) return;

    await noteSeen(label, Number.isFinite(at) ? at : Date.now(), entering ? 'enter' : 'exit');
  } catch {
    // see above: nothing above this can catch anything, so nothing may escape
  }
}

/**
 * Whether the platform will report crossings at all.
 *
 * Two grants on Android and the second is asked separately, in its own dialog, after
 * the first — so a phone can be halfway through this and neither refusing nor ready.
 * Reported as three states rather than a boolean for that reason.
 */
export async function backgroundLocationState(): Promise<'ready' | 'foreground-only' | 'refused'> {
  try {
    const fine = await Location.getForegroundPermissionsAsync();
    if (!fine.granted) return 'refused';
    const background = await Location.getBackgroundPermissionsAsync();
    return background.granted ? 'ready' : 'foreground-only';
  } catch {
    // a build without the permission in its manifest throws here rather than refusing
    return 'refused';
  }
}

/**
 * Start watching the named places, or say why it cannot.
 *
 * Returns the reason rather than a boolean: *the manifest does not carry the
 * permission* and *you said no* are different facts, and the screen that offers this
 * has to say which. Until the next APK it is always the first.
 */
export async function startWatchingPlaces(
  places: KnownPlace[]
): Promise<'watching' | 'no-permission' | 'nothing-named' | 'unavailable'> {
  const regions = geofenceRegions(places);
  if (!regions.length) return 'nothing-named';

  const state = await backgroundLocationState();
  if (state !== 'ready') return 'no-permission';

  try {
    await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
    return 'watching';
  } catch {
    // a build whose manifest lacks the permission lands here, which is the state the
    // whole app is in until queue 23 ships
    return 'unavailable';
  }
}

/** stop watching, and forget the registration Android is holding */
export async function stopWatchingPlaces(): Promise<void> {
  try {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
  } catch {
    /* nothing held, or a build that cannot hold one */
  }
}

/**
 * Define the task at module scope, the way the notification handler is.
 *
 * The OS hands work back to a process it has just woken, before any component mounts,
 * so a task defined inside a screen is a task that does not exist when it is needed.
 * Defining it is free; it does nothing until `startGeofencingAsync` names it.
 */
try {
  if (!TaskManager.isTaskDefined(GEOFENCE_TASK)) {
    TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
      // awaited rather than fired and forgotten: the OS may put the process straight
      // back to sleep once this resolves, and a pending write would go with it
      if (error) return;
      await onGeofenceEvent(data as GeofenceEvent);
    });
  }
} catch {
  // a harness without the native side cannot define tasks, and does not need to
}

/**
 * Ask for both grants, in the order Android insists on.
 *
 * Fine location first; the background dialog is refused outright if it is asked for
 * on its own. On Android 11 and later the second one does not even appear as a
 * dialog — it opens Settings, where the choice is *Allow all the time* — so this can
 * return `foreground-only` with nothing having gone wrong, and the row that calls it
 * says what to do next rather than reporting a failure.
 */
export async function askForBackgroundLocation(): Promise<'ready' | 'foreground-only' | 'refused'> {
  try {
    const fine = await Location.requestForegroundPermissionsAsync();
    if (!fine.granted) return 'refused';
    const background = await Location.requestBackgroundPermissionsAsync();
    return background.granted ? 'ready' : 'foreground-only';
  } catch {
    // a manifest without the permission throws rather than refusing
    return 'refused';
  }
}

/** whether Android is holding a registration right now, as opposed to having been asked once */
export async function watchingPlaces(): Promise<boolean> {
  try {
    // compared rather than returned: a platform that answers undefined is not
    // watching, and a screen that renders undefined as a state shows nothing at all
    return (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) === true;
  } catch {
    return false;
  }
}
