import { commutePayload, deviceTimezone } from '../commuteSync';
import { DEFAULT_COMMUTE, WEEKDAYS_ONLY } from '../commute';
import type { CommuteSettings } from '../commute';
import type { KnownPlace } from '../knownPlaces';

const place = (id: string, lat: number, lon: number): KnownPlace => ({
  id,
  label: id,
  lat,
  lon,
  area: 'somewhere',
});

const settings = (over: Partial<CommuteSettings> = {}): CommuteSettings => ({
  ...DEFAULT_COMMUTE,
  departures: DEFAULT_COMMUTE.departures.map((d) => ({ ...d })),
  days: [...WEEKDAYS_ONLY],
  ...over,
});

describe('the commute payload the gateway is given', () => {
  it('uploads only the departures that are switched on', () => {
    const s = settings();
    s.departures[0].on = true;
    const out = commutePayload(s, [place('home', 22.5, 88.3), place('office', 22.6, 88.4)], 'Asia/Kolkata');
    expect(out.departures.map((d) => d.place_id)).toEqual(['home']);
  });

  /**
   * The gateway cannot forecast for a place it has no point for, and a row it
   * cannot act on is worse than an absent one: it would schedule a briefing that
   * can only ever fail. The phone is where `KnownPlace` lives, so the phone is
   * where the filtering belongs — this mirrors `coordsFor` in `commuteTask.ts`,
   * which already refuses to brief an unnamed place.
   */
  it('drops a departure whose place has never been named', () => {
    const s = settings();
    s.departures[1].on = true; // office, and no office in the list below
    const out = commutePayload(s, [place('home', 22.5, 88.3)], 'Asia/Kolkata');
    expect(out.departures).toEqual([]);
  });

  it('carries the coordinates of the named place, not of wherever the phone is', () => {
    const s = settings();
    s.departures[1].on = true;
    const out = commutePayload(s, [place('office', 22.5726, 88.3639)], 'Asia/Kolkata');
    expect(out.departures[0]).toMatchObject({ place_id: 'office', lat: 22.5726, lon: 88.3639, hour: 19, minute: 0 });
  });

  it('carries the days as the phone counts them, Sunday first', () => {
    const out = commutePayload(settings(), [], 'Asia/Kolkata');
    expect(out.days).toEqual(WEEKDAYS_ONLY);
  });

  /**
   * The gateway schedules in the phone's local time, so the zone is part of the
   * contract rather than an assumption. A server in UTC briefing an operator in
   * Kolkata would fire five and a half hours late, every day, silently.
   */
  it('names the timezone it wants to be scheduled in', () => {
    const out = commutePayload(settings(), [], 'Asia/Kolkata');
    expect(out.tz).toBe('Asia/Kolkata');
  });

  /**
   * Switching the feature off has to SAY so. An empty upload that the gateway
   * reads as "nothing changed" would leave it briefing on a schedule the phone
   * has abandoned — a notification arriving from a setting the user turned off is
   * the worst failure this feature has available.
   */
  it('sends an empty list rather than nothing when every departure is off', () => {
    const out = commutePayload(settings(), [place('home', 1, 2)], 'Asia/Kolkata');
    expect(out.departures).toEqual([]);
    expect(out.days).toHaveLength(7);
  });

  it('reports a timezone name for this device', () => {
    // not asserting which: the harness runs in whatever zone CI is set to
    expect(typeof deviceTimezone()).toBe('string');
    expect(deviceTimezone().length).toBeGreaterThan(0);
  });
});
