import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  GEOFENCE_TASK,
  backgroundLocationState,
  geofenceRegions,
  onGeofenceEvent,
  askForBackgroundLocation,
  startWatchingPlaces,
  stopWatchingPlaces,
  watchingPlaces,
} from '../geofence';
import { loadSeen } from '../timeline';
import type { KnownPlace } from '../knownPlaces';

/**
 * Sightings that happen whether or not anybody is holding the phone.
 *
 * Every figure in this app was built on sightings written when the app happened to be
 * opened, and 2026-09-01 spent the day paying for it: *"usually at Home by 10:49 AM"*
 * to a man who slept there, *"usually gone by 3:40 PM"* about an office he leaves at
 * seven, and a repair that could only ever be an upper bound. One root, three wrong
 * figures, all caught by the person they were about.
 *
 * A geofence exit is the real event. Android reports the boundary being crossed a
 * couple of minutes late rather than hours, and it does it with the app closed —
 * which is the only reason a departure can ever be measured rather than inferred.
 *
 * **This file tests the parts that do not need the permission**, because the manifest
 * entry moves the OTA fingerprint and therefore waits for the next APK. The task body,
 * the regions and the writing are all exercised here; only the registration is not.
 */

const place = (label: string, lat: number, lon: number): KnownPlace => ({
  id: label.toLowerCase(),
  label,
  lat,
  lon,
  area: '',
});

const HOME = place('Home', 22.81556, 88.37106);
const OFFICE = place('Office', 22.5769, 88.4344);

/** inside the store's twelve-week window, or the read filters it back out */
const recent = Date.now() - 60_000;

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('the regions it watches', () => {
  it('watches every named place', () => {
    expect(geofenceRegions([HOME, OFFICE]).map((r) => r.identifier).sort()).toEqual([
      'Home',
      'Office',
    ]);
  });

  it('asks for both crossings, since a departure is the point', () => {
    const [region] = geofenceRegions([HOME]);
    expect(region.notifyOnEnter).toBe(true);
    expect(region.notifyOnExit).toBe(true);
  });

  it('uses a radius Android will actually honour', () => {
    // below about a hundred metres the platform reports crossings that did not happen,
    // and the match radius the app uses for naming is 120
    const [region] = geofenceRegions([HOME]);
    expect(region.radius).toBeGreaterThanOrEqual(100);
    expect(region.radius).toBeLessThanOrEqual(200);
  });

  it('has nothing to watch before anywhere is named', () => {
    expect(geofenceRegions([])).toEqual([]);
  });
});

describe('what an event writes', () => {
  it('records an exit as an exit, so a departure can be measured', async () => {
    await onGeofenceEvent({ eventType: 'exit', region: { identifier: 'Office' } }, recent);
    const [sighting] = await loadSeen();
    expect(sighting.place).toBe('Office');
    expect(sighting.via).toBe('exit');
  });

  it('records an entry too, which is the arrival the app could never see', async () => {
    await onGeofenceEvent({ eventType: 'enter', region: { identifier: 'Home' } }, recent);
    expect((await loadSeen())[0].via).toBe('enter');
  });

  it('ignores an event with no region, rather than writing a nameless sighting', async () => {
    await onGeofenceEvent({ eventType: 'exit', region: null }, recent);
    expect(await loadSeen()).toEqual([]);
  });

  it('ignores an event it cannot make sense of', async () => {
    await onGeofenceEvent(null, recent);
    expect(await loadSeen()).toEqual([]);
  });

  it('never throws, because it runs where nothing can catch it', async () => {
    // this body is invoked by the OS with the app closed; a throw here is a crash
    // nobody sees and a sighting silently lost
    await expect(
      onGeofenceEvent({ eventType: 'exit', region: { identifier: 'Office' } }, Number.NaN)
    ).resolves.toBeUndefined();
  });
});

describe('the task name', () => {
  it('is stable, because Android remembers it across launches', () => {
    // renaming it would orphan a registration that nothing in the app can then stop
    expect(GEOFENCE_TASK).toBe('jarvis-place-geofence');
  });
});

describe('asking for the permission', () => {
  it('reports the three states apart, because two of them are not refusals', async () => {
    // Android asks in two steps: fine first, background in its own dialog after. A
    // phone halfway through is neither refusing nor ready, and a screen that offers
    // this has to say which
    const state = await backgroundLocationState();
    expect(['ready', 'foreground-only', 'refused']).toContain(state);
  });

  it('says why it cannot start, rather than answering false', async () => {
    // "the manifest has no permission" and "you said no" are different facts and the
    // fix for each is different: one is a build, the other is a dialog
    const why = await startWatchingPlaces([HOME]);
    expect(['watching', 'no-permission', 'nothing-named', 'unavailable']).toContain(why);
  });

  it('has nothing to watch before a place is named', async () => {
    expect(await startWatchingPlaces([])).toBe('nothing-named');
  });
});

describe('what is being watched right now', () => {
  it('is nothing, on a build that cannot watch', async () => {
    // the question a screen asks on every visit, so it answers rather than throwing
    expect(await watchingPlaces()).toBe(false);
  });

  it('stops without complaining when nothing is registered', async () => {
    await expect(stopWatchingPlaces()).resolves.toBeUndefined();
  });

  it('asks for the two grants as one answer, not two booleans', async () => {
    // Android 11 opens Settings for the second rather than showing a dialog, so
    // "foreground-only" is a normal outcome and not a failure
    expect(['ready', 'foreground-only', 'refused']).toContain(await askForBackgroundLocation());
  });
});
