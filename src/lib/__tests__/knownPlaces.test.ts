import { AT_PLACE_KM, distanceKm, nameFor } from '../knownPlaces';
import type { KnownPlace } from '../knownPlaces';

/**
 * Which named place you are standing in — and refusing to guess when it cannot tell.
 *
 * **Reported from the phone, 2026-09-01.** Home and a named area about 150 metres
 * apart, and walking to the area never changed what the app said. Two causes, and the
 * radius was only the smaller one:
 *
 * - the fix used to name a place was taken at `Accuracy.Balanced`, which is around a
 *   hundred metres and is derived from wifi and cell rather than GPS. Wifi positioning
 *   anchors to routers it knows — his own — so from down the road it can still hand
 *   back the coordinates of his living room;
 * - the match radius was 250 metres, so each place sat inside the other's circle and
 *   the winner was decided by whichever way that hundred metres of error fell.
 *
 * So the fix carries its own accuracy now, and a place has to win by more than that
 * error to be named at all. **Saying nothing is the correct answer to "which of these
 * two, given a reading that cannot separate them".**
 */

const place = (label: string, lat: number, lon: number): KnownPlace => ({
  id: label.toLowerCase(),
  label,
  lat,
  lon,
  area: '',
});

/** roughly 111 km per degree of latitude, so 0.00135° is about 150 m */
const HOME = place('Home', 22.7500, 88.3700);
const AREA = place('My area', 22.75135, 88.3700);
const OFFICE = place('Office', 22.5800, 88.4300);

const at = (p: { lat: number; lon: number }) => ({ lat: p.lat, lon: p.lon });

describe('how far apart the reported places actually are', () => {
  it('puts Home and the area about 150 metres apart', () => {
    const m = distanceKm(at(HOME), at(AREA)) * 1000;
    expect(m).toBeGreaterThan(130);
    expect(m).toBeLessThan(170);
  });

  it('no longer calls 150 metres the same place', () => {
    // 250 m did exactly that, which is the whole report
    expect(AT_PLACE_KM * 1000).toBeLessThan(150);
  });
});

describe('naming the place you are standing in', () => {
  const places = [HOME, AREA, OFFICE];

  it('names Home when you are at Home and the reading is good', () => {
    expect(nameFor({ ...at(HOME), accuracy: 15 }, places)).toBe('Home');
  });

  it('names the area when you have walked to it', () => {
    // the report: this used to answer Home, because Home was inside the same circle
    expect(nameFor({ ...at(AREA), accuracy: 15 }, places)).toBe('My area');
  });

  it('says nothing when the reading cannot separate two places', () => {
    // 200 m of error against a 150 m gap is not an answer, it is a coin toss — and a
    // coin toss reported as a place is what put him at Home while he stood elsewhere
    expect(nameFor({ ...at(AREA), accuracy: 200 }, places)).toBeNull();
  });

  it('still answers with a poor reading when nothing else is nearby', () => {
    // the Office has no neighbour to be confused with, so a loose fix is still enough
    expect(nameFor({ ...at(OFFICE), accuracy: 200 }, places)).toBe('Office');
  });

  it('says nothing when you are at none of them', () => {
    expect(nameFor({ lat: 22.9, lon: 88.9, accuracy: 15 }, places)).toBeNull();
  });

  it('treats a fix with no accuracy as trustworthy, which is how old callers behaved', () => {
    expect(nameFor(at(AREA), places)).toBe('My area');
  });
});
