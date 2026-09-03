import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { clockLabel } from './commute';
import { AT_PLACE_KM, distanceKm, farApart, loadKnown } from './knownPlaces';
import { currentFix } from './place';
import type { KnownPlace } from './knownPlaces';
import { dismiss, postNow } from './notify';
import { dropExitsAround, isCrossing, loadSeen, noteSeen } from './timeline';

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

/**
 * How close together two exits have to be before they are the platform, not you.
 *
 * Play Services re-evaluates every region when the app process restarts and reports an
 * exit for each one the phone is outside of. On 2026-09-01 at 18:31 that was ten named
 * places, ten notifications and ten false departures, from an office he had not left
 * yet — every event real, not one of them a departure.
 *
 * Ninety seconds, because a person leaves one place at a time. The nearest genuine
 * pair — out of the flat, out of the block — is minutes apart, not seconds.
 */
export const SWEEP_WINDOW_MS = 90_000;

/**
 * How long a departure has to stand before it is worth saying out loud.
 *
 * The first exit of a sweep is indistinguishable from a real one, so the choice is to
 * speak and retract, or to wait. Speaking and retracting was tried on 2026-09-01 and
 * left *"Left Home — 6:40 PM"* standing in the shade about a house he was nowhere
 * near: the dismissal is best-effort and the shade is not. Ten seconds is longer than
 * a burst takes to arrive and shorter than anyone notices in a notification about
 * something they just did.
 *
 * The sighting is never delayed. If the process is killed inside this window the
 * departure is still recorded, and only the word about it is lost.
 */
export const SPEAK_AFTER_MS = 10_000;

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
export async function onGeofenceEvent(
  event: GeofenceEvent,
  at: number = Date.now(),
  speakAfterMs: number = SPEAK_AFTER_MS,
  places?: KnownPlace[]
): Promise<void> {
  try {
    const kind = event?.eventType;
    const label = event?.region?.identifier;
    if (typeof label !== 'string' || !label) return;

    // `Location.GeofencingEventType` is an enum on the device and a string in the
    // harness; both shapes are accepted rather than one being assumed
    const entering = kind === 'enter' || kind === Location.GeofencingEventType.Enter;
    const leaving = kind === 'exit' || kind === Location.GeofencingEventType.Exit;
    if (!entering && !leaving) return;

    const when = Number.isFinite(at) ? at : Date.now();

    /**
     * A departure from somewhere else, seconds ago, means neither of them happened.
     *
     * The first exit of a sweep is indistinguishable from a real one — it is the
     * second place in the same breath that gives it away — so this reaches backwards
     * and takes the earlier ones out again. It cannot be done any earlier: at the
     * moment the first arrives there is nothing to tell it apart from you walking out
     * of your office.
     */
    if (entering && (await alreadyInside(label))) return;

    if (leaving) {
      // the places are needed twice over: to tell a sweep from a walk, since two
      // departures are the platform only if a person could not have made both, and to
      // ask whether the phone is still standing in the place it just reported leaving
      const known = places ?? (await loadKnown());
      if ((await inSweep(when)) || (await sweepDetected(when, label, farApart(known)))) return;
      if (await stillThere(label, known)) return;
    }

    await noteSeen(label, when, entering ? 'enter' : 'exit');

    // the sighting is written first and separately: a notification that cannot be
    // posted is an annoyance, a departure that was never recorded is the figure this
    // whole file exists to measure
    if (!leaving) return;

    /**
     * Wait, then check the sighting is still there before saying anything.
     *
     * A burst that arrives during this window takes the sighting out again, and a
     * word about a departure that has been retracted is worse than silence: the
     * notification outlives the correction.
     */
    /**
     * Wait, then look again — at the burst, not only at this sighting.
     *
     * Two exits can be delivered in the same second, and each handler reads the store
     * before the other has written to it: neither sees a burst, both write, both
     * speak. That is exactly what reached the phone at 16:03 on 2026-09-02 —
     * *"Left Mousumi's Home"* and *"Left Sealdah Rail Station"*, from an office forty
     * kilometres from either.
     *
     * So the check after the wait is the whole check, run again against a store that
     * has by then settled. The first pass stops most of it; this pass is the one that
     * cannot be raced.
     */
    if (speakAfterMs > 0) await new Promise((r) => setTimeout(r, speakAfterMs));
    if (await inSweep(when)) return;
    if (await sweepDetected(when, label, farApart(places ?? (await loadKnown())))) return;
    const kept = (await loadSeen()).some(
      (s) => s.place === label && s.at === when && s.via === 'exit'
    );
    if (kept) await announceLeaving(label, when);
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

/**
 * How long a place stays quiet after it has said you left.
 *
 * A geofence boundary is a line, and standing near it makes Android report crossing
 * it several times: each event is real and only the first is a departure. Forty-five
 * minutes is longer than any wobble and shorter than a genuine second departure from
 * the same place — going back for a forgotten bag and leaving again still gets a word.
 */
export const LEAVE_COOLDOWN_MS = 45 * 60_000;

const LEFT_SAID_KEY = 'jarvis_left_said';

/** when a sweep was last recognised, so the rest of the burst goes quietly */
const SWEEP_AT_KEY = 'jarvis_sweep_at';

/** the last thing said, kept so a sweep can take its own notification back */
const LEFT_LAST_KEY = 'jarvis_left_last';

type LeftSaid = Record<string, number>;

const loadLeftSaid = async (): Promise<LeftSaid> => {
  try {
    const raw = await AsyncStorage.getItem(LEFT_SAID_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as LeftSaid) : {};
  } catch {
    return {};
  }
};

/**
 * How sure a reading has to be before it may overrule a crossing.
 *
 * A fix good to 300 m cannot tell inside from outside a 120 m circle, and a check
 * that cannot decide must never be the thing that decides. Anything vaguer than this
 * is ignored and the crossing is believed.
 */
export const FIX_TRUSTED_M = 150;

/**
 * Whether the app already believes you are inside this place.
 *
 * **Measured on 2026-09-02: six *"Reached Office"* between 12:33 and 1:23, from a desk
 * he never left.** The drift check refuses the phantom exits that come with a
 * wandering fix; the phantom re-entries that follow them walked straight in, because
 * only departures were ever guarded. An arrival at a place you are already standing in
 * is not an arrival.
 *
 * Judged on the last crossing for that place alone. A departure between two arrivals
 * makes the second one a real return, which is a thing that happens — lunch, a
 * meeting, the walk to the station and back.
 */
async function alreadyInside(label: string): Promise<boolean> {
  try {
    const seen = await loadSeen();
    const last = seen.filter((s) => s.place === label && isCrossing(s)).pop();
    return last?.via === 'enter';
  } catch {
    return false;
  }
}

/**
 * Whether the phone is still standing in the place it was just reported leaving.
 *
 * **Measured on 2026-09-02 at 18:12: *"Left Office"* while he sat at his desk.** The
 * dot on the map had wandered outside the circle with the accuracy ring ballooning —
 * a drifting fix crossed the boundary, Play Services reported it honestly, and with a
 * single place involved there was no burst for the sweep rules to recognise.
 *
 * So an exit gets a second opinion: one fresh reading, compared against the place it
 * claims you left. **Every doubt resolves in favour of the crossing** — no fix, a
 * vague fix, a place with no coordinates, all mean the geofence stands. The geofence
 * is the measurement; this is only a witness that can say *no, he is still here*.
 */
async function stillThere(label: string, places: KnownPlace[]): Promise<boolean> {
  try {
    const place = places.find((p) => p.label === label);
    if (!place) return false;

    const fix = await currentFix();
    if (!fix) return false;

    const accuracy = typeof fix.accuracy === 'number' ? fix.accuracy : 0;
    if (accuracy > FIX_TRUSTED_M) return false;

    // the accuracy is spent in the crossing's favour: only a reading that puts him
    // inside the circle even at its own worst case may overrule it
    const metres = distanceKm(fix, { lat: place.lat, lon: place.lon }) * 1000;
    return metres + accuracy <= GEOFENCE_RADIUS_M;
  } catch {
    // a check that throws has not decided anything
    return false;
  }
}

/**
 * Whether this exit belongs to a burst rather than to you, and clean up if it does.
 *
 * Three separate jobs, because a sweep is only recognisable partway through it:
 *
 * 1. **Already known.** Once a burst has been spotted, every later exit in the same
 *    ninety seconds is part of it and goes quietly.
 * 2. **Recognise it.** Another place reporting a departure seconds ago is the
 *    signature — a person leaves one place at a time.
 * 3. **Take back what was already said.** The first exit of a burst was written and
 *    announced before there was anything to tell it apart from a real departure, so
 *    the sighting is removed, the notification is dismissed from the shade, and the
 *    quiet period for that place is handed back.
 */
async function inSweep(when: number): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SWEEP_AT_KEY);
    const mark = raw ? Number(raw) : NaN;
    if (Number.isFinite(mark) && Math.abs(when - mark) <= SWEEP_WINDOW_MS) return true;
  } catch {
    /* an unreadable mark is no mark */
  }
  return false;
}

/** the same question, asked with the label, plus the repair */
async function sweepDetected(
  when: number,
  label: string,
  far: (a: string, b: string) => boolean
): Promise<boolean> {
  const dropped = await dropExitsAround(when, label, SWEEP_WINDOW_MS, far);
  if (!dropped) return false;

  try {
    await AsyncStorage.setItem(SWEEP_AT_KEY, String(when));
    await noteSweep(when);

    // the first one was already said out loud: take it off the shade and give the
    // place its quiet period back, so a real departure minutes later still speaks
    const raw = await AsyncStorage.getItem(LEFT_LAST_KEY);
    const last = raw ? (JSON.parse(raw) as { id?: string; place?: string; at?: number }) : null;
    if (last && typeof last.at === 'number' && Math.abs(when - last.at) <= SWEEP_WINDOW_MS) {
      if (typeof last.id === 'string') await dismiss(last.id);
      if (typeof last.place === 'string') {
        const said = await loadLeftSaid();
        delete said[last.place];
        await AsyncStorage.setItem(LEFT_SAID_KEY, JSON.stringify(said));
      }
    }
  } catch {
    // the sighting is already gone, which is the half that matters
  }
  return true;
}

/**
 * Say you left, once per place per cooldown.
 *
 * **Exits only, and that is the whole design.** Ten named places reporting both
 * crossings is a phone that buzzes all day for things you already know; the departure
 * is the one carrying a figure the app could never measure before.
 *
 * The cooldown is per place rather than per phone, because leaving home and reaching
 * the office are fifteen minutes apart on the same morning and both are worth a word.
 */
export async function announceLeaving(place: string, at: number): Promise<void> {
  const said = await loadLeftSaid();
  const last = said[place];
  if (typeof last === 'number' && at - last < LEAVE_COOLDOWN_MS && at >= last) return;

  // written before the notification, not after: if posting throws, the alternative is
  // a phone that says the same thing again on the next wobble
  await AsyncStorage.setItem(LEFT_SAID_KEY, JSON.stringify({ ...said, [place]: at }));

  const when = new Date(at);
  const id = await postNow({
    title: `Left ${place}`,
    body: `${clockLabel(when.getHours(), when.getMinutes())}. Noted, sir.`,
    data: { kind: 'left-place', place, at },
  });

  // kept so that if this turns out to have been the first shot of a sweep, the
  // notification can be taken back rather than left standing as a false departure
  try {
    await AsyncStorage.setItem(LEFT_LAST_KEY, JSON.stringify({ id, place, at }));
  } catch {
    /* it only costs the ability to undo */
  }
}

/**
 * Post the departure notification without recording a departure.
 *
 * The real thing cannot be induced from a laptop — it needs a person to walk out of a
 * 120 m circle — and a notification nobody has ever seen is a notification nobody
 * knows is silent, on the wrong channel, or truncated. This posts the same content and
 * touches neither the sighting store nor the cooldown, so pressing it cannot teach the
 * app a departure that never happened.
 */
export async function previewLeaving(place: string, at: number = Date.now()): Promise<void> {
  const when = new Date(at);
  await postNow({
    title: `Left ${place}`,
    body: `${clockLabel(when.getHours(), when.getMinutes())}. Noted, sir.`,
    data: { kind: 'left-place', place, at, preview: true },
  });
}
/** forget what has been said, so the next exit speaks — the CLEAR lever for this row */
export async function forgetLeaving(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEFT_SAID_KEY);
  } catch {
    /* nothing stored */
  }
}

/** how many bursts were recognised today, kept per day so the figure is about today */
const SWEEP_COUNT_KEY = 'jarvis_sweep_count';

const dayOf = (at: number): string => {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * Record that a burst was thrown away.
 *
 * Kept so the Places row can say how much was refused, which is the half of *"nothing
 * happened"* that nobody could otherwise see. A day with three sweeps and no
 * notifications is the rule working; a day with none and a missing departure is the
 * rule failing, and until this counter existed those looked identical.
 */
export async function noteSweep(at: number): Promise<void> {
  try {
    const day = dayOf(at);
    const raw = await AsyncStorage.getItem(SWEEP_COUNT_KEY);
    const held = raw ? (JSON.parse(raw) as { day?: string; count?: number }) : null;
    const count = held && held.day === day && typeof held.count === 'number' ? held.count : 0;
    await AsyncStorage.setItem(SWEEP_COUNT_KEY, JSON.stringify({ day, count: count + 1 }));
  } catch {
    /* a lost count costs a diagnostic, not a sighting */
  }
}

/** how many bursts were refused on the day `now` falls in */
export async function sweepsToday(now: number = Date.now()): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SWEEP_COUNT_KEY);
    const held = raw ? (JSON.parse(raw) as { day?: string; count?: number }) : null;
    if (!held || held.day !== dayOf(now) || typeof held.count !== 'number') return 0;
    return held.count;
  } catch {
    return 0;
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
