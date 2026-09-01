import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  GEOFENCE_TASK,
  backgroundLocationState,
  geofenceRegions,
  onGeofenceEvent,
  previewLeaving,
  askForBackgroundLocation,
  startWatchingPlaces,
  stopWatchingPlaces,
  watchingPlaces,
} from '../geofence';
import { loadSeen } from '../timeline';
import type { KnownPlace } from '../knownPlaces';

const mockPosted = jest.fn().mockResolvedValue('id');
jest.mock('../notify', () => ({
  postNow: (...a: unknown[]) => mockPosted(...a),
  GENERAL_CHANNEL: 'general-v8',
}));
const posted = mockPosted;

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

/** a time today, so the notification body can be checked against a clock */
const at = (hour: number, minute: number): number =>
  new Date(new Date().setHours(hour, minute, 0, 0)).getTime();

/** inside the store's twelve-week window, or the read filters it back out */
const recent = Date.now() - 60_000;

/** the ten-second pause before speaking is real time, and no test wants to spend it */
const fire = (event: Parameters<typeof onGeofenceEvent>[0], at?: number, ms = 0) =>
  onGeofenceEvent(event, at, ms);

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
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, recent);
    const [sighting] = await loadSeen();
    expect(sighting.place).toBe('Office');
    expect(sighting.via).toBe('exit');
  });

  it('records an entry too, which is the arrival the app could never see', async () => {
    await fire({ eventType: 'enter', region: { identifier: 'Home' } }, recent);
    expect((await loadSeen())[0].via).toBe('enter');
  });

  it('ignores an event with no region, rather than writing a nameless sighting', async () => {
    await fire({ eventType: 'exit', region: null }, recent);
    expect(await loadSeen()).toEqual([]);
  });

  it('ignores an event it cannot make sense of', async () => {
    await fire(null, recent);
    expect(await loadSeen()).toEqual([]);
  });

  it('never throws, because it runs where nothing can catch it', async () => {
    // this body is invoked by the OS with the app closed; a throw here is a crash
    // nobody sees and a sighting silently lost
    await expect(
      fire({ eventType: 'exit', region: { identifier: 'Office' } }, Number.NaN)
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

describe('being told you left', () => {
  beforeEach(() => {
    posted.mockClear();
  });

  it('says where and when, because a time is the whole point of the row', async () => {
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(18, 47));
    expect(posted).toHaveBeenCalledTimes(1);
    const [opts] = posted.mock.calls[0];
    expect(opts.title).toContain('Office');
    expect(opts.body).toContain('6:47 PM');
  });

  it('says nothing when you arrive, which is what was asked for', async () => {
    // ten places, both crossings, would be a phone that buzzes all day. Only the
    // departure carries a figure the app could not measure before
    await fire({ eventType: 'enter', region: { identifier: 'Office' } }, at(9, 20));
    expect(posted).not.toHaveBeenCalled();
  });

  it('stays quiet on a second exit inside the cooldown', async () => {
    // standing at the edge of a 120 m circle makes Android report crossing it
    // repeatedly, and each one is a real event that is not a real departure
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(18, 47));
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(18, 52));
    expect(posted).toHaveBeenCalledTimes(1);
  });

  it('speaks again once the cooldown is spent, since leaving twice is a real thing', async () => {
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(13, 0));
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(19, 5));
    expect(posted).toHaveBeenCalledTimes(2);
  });

  it('keeps a cooldown per place, not one for the whole phone', async () => {
    // leaving home and reaching the office are minutes apart on the same morning
    await fire({ eventType: 'exit', region: { identifier: 'Home' } }, at(9, 10));
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(9, 25));
    expect(posted).toHaveBeenCalledTimes(2);
  });

  it('still writes the sighting when the notification cannot be posted', async () => {
    // the sighting is the thing that matters: a lost notification is an annoyance,
    // a lost departure is the figure this whole file exists to measure
    posted.mockRejectedValueOnce(new Error('no channel'));
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(18, 47));
    expect((await loadSeen())[0].via).toBe('exit');
  });
});

describe('seeing the notification without leaving', () => {
  it('posts the same words, so what is checked is what will arrive', async () => {
    posted.mockClear();
    await previewLeaving('Office', at(19, 10));
    expect(posted.mock.calls[0][0].body).toContain('7:10 PM');
  });

  it('records nothing, so a preview cannot teach a departure that never happened', async () => {
    await previewLeaving('Office', at(19, 10));
    expect(await loadSeen()).toEqual([]);
    // and it does not spend the cooldown either
    posted.mockClear();
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(19, 12));
    expect(posted).toHaveBeenCalledTimes(1);
  });
});

describe('the sweep Android fires at every restart', () => {
  beforeEach(() => {
    posted.mockClear();
  });

  it('ignores exits from several places at once, because a person leaves one place at a time', async () => {
    // measured on the phone, 2026-09-01 18:31: ten named places, ten "you left"
    // notifications in the same minute, from an office he had not left yet. Play
    // Services re-evaluates every region when the app process restarts and reports an
    // exit for each one the phone is outside of. Every event is real; not one is a
    // departure
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(18, 31));
    await fire({ eventType: 'exit', region: { identifier: 'Musalman Para' } }, at(18, 31));
    await fire(
      { eventType: 'exit', region: { identifier: 'Barrackpore Railway Station' } },
      at(18, 31)
    );
    expect(await loadSeen()).toEqual([]);
  });

  it('takes back the first one, which looked real until the second arrived', async () => {
    // the first exit of a sweep is indistinguishable from a departure. It is only the
    // second place in the same breath that gives it away, so the repair has to reach
    // backwards
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(18, 31));
    expect(await loadSeen()).toHaveLength(1);
    await fire({ eventType: 'exit', region: { identifier: 'Sector V' } }, at(18, 31));
    expect(await loadSeen()).toEqual([]);
  });

  it('says nothing more once it knows, and one buzz is the cost of finding out', async () => {
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(18, 31));
    await fire({ eventType: 'exit', region: { identifier: 'Sector V' } }, at(18, 31));
    await fire({ eventType: 'exit', region: { identifier: 'Home' } }, at(18, 31));
    expect(posted).toHaveBeenCalledTimes(1);
  });

  it('still believes a single departure, which is the whole feature', async () => {
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(19, 5));
    const seen = await loadSeen();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ place: 'Office', via: 'exit' });
    expect(posted).toHaveBeenCalledTimes(1);
  });

  it('lets two real departures stand when they are far enough apart', async () => {
    // leaving home in the morning and the office in the evening are both true
    await fire({ eventType: 'exit', region: { identifier: 'Home' } }, at(9, 10));
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(19, 5));
    expect(await loadSeen()).toHaveLength(2);
  });

  it('never drops an arrival, which no sweep produces', async () => {
    await fire({ eventType: 'enter', region: { identifier: 'Office' } }, at(18, 31));
    await fire({ eventType: 'exit', region: { identifier: 'Home' } }, at(18, 31));
    await fire({ eventType: 'exit', region: { identifier: 'Sector V' } }, at(18, 31));
    const seen = await loadSeen();
    expect(seen).toEqual([expect.objectContaining({ place: 'Office', via: 'enter' })]);
  });
});

describe('waiting a moment before speaking', () => {
  beforeEach(() => {
    posted.mockClear();
  });

  it('says nothing at all when the rest of the burst lands while it waits', async () => {
    // the first exit of a sweep cannot be recognised when it arrives. Rather than
    // buzzing and taking it back - which leaves a false departure standing in the
    // shade if the dismissal does not land - the word waits until the sighting has
    // survived. Measured on the phone: "Left Home 6:40 PM" stayed put after the
    // retraction, about a home he was nowhere near
    const settle = fire(
      { eventType: 'exit', region: { identifier: 'Home' } },
      at(18, 40),
      200
    );
    // the sighting has to be written before the second event can recognise the burst,
    // which on a phone is seconds and here is a tick
    await new Promise((r) => setTimeout(r, 20));
    await fire({ eventType: 'exit', region: { identifier: 'Sector V' } }, at(18, 40), 0);
    await settle;
    expect(posted).not.toHaveBeenCalled();
    expect(await loadSeen()).toEqual([]);
  });

  it('still speaks for a departure that nothing contradicts', async () => {
    await fire({ eventType: 'exit', region: { identifier: 'Office' } }, at(19, 5), 0);
    expect(posted).toHaveBeenCalledTimes(1);
  });
});
