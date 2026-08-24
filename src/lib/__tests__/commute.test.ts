import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_COMMUTE,
  CLOUD_TTL_HOURS,
  alreadyBriefed,
  cloudArmed,
  cloudArmedState,
  clockLabel,
  commuteBriefing,
  dueDeparture,
  hourLabel,
  dueToday,
  loadCommute,
  markBriefed,
  markCloudArmed,
  saveCommute,
} from '../commute';
import type { CommuteSettings, Departure } from '../commute';

/**
 * The clock labels, the day mask, and which door is due.
 *
 * These exist because a briefing set for 8 PM was stored as hour 8. The stepper,
 * the row on the Places screen and the notification body all agreed with each
 * other in 24-hour digits, so nothing contradicted the mistake until the briefing
 * failed to arrive twelve hours after it had quietly already been due.
 */

const at = (placeId: string, hour: number, minute = 0): CommuteSettings => ({
  ...DEFAULT_COMMUTE,
  departures: DEFAULT_COMMUTE.departures.map((d) =>
    d.placeId === placeId ? { ...d, on: true, hour, minute } : { ...d, on: false }
  ),
});

/** a Friday and a Saturday, so the day mask is what decides */
const friday = (hour: number, minute = 0) => new Date(2026, 7, 14, hour, minute);
const saturday = (hour: number, minute = 0) => new Date(2026, 7, 15, hour, minute);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('clockLabel', () => {
  it('separates eight in the morning from eight at night', () => {
    // the whole bug in one assertion
    expect(clockLabel(8, 0)).toBe('8:00 AM');
    expect(clockLabel(20, 0)).toBe('8:00 PM');
  });

  it('calls midnight 12 AM and noon 12 PM, not 0', () => {
    expect(clockLabel(0, 15)).toBe('12:15 AM');
    expect(clockLabel(12, 15)).toBe('12:15 PM');
  });

  it('pads the minutes', () => {
    expect(clockLabel(9, 5)).toBe('9:05 AM');
  });
});

describe('hourLabel', () => {
  it('carries the meridiem on both ends of a window that shares one', () => {
    // "08:00–11:00" was the label that failed to warn him; the redundancy here is
    // deliberate, not an oversight
    expect(`${hourLabel(8)}–${hourLabel(11)}`).toBe('8 AM–11 AM');
  });

  it('spans noon and midnight without wrapping to 0', () => {
    expect(`${hourLabel(11)}–${hourLabel(14)}`).toBe('11 AM–2 PM');
    expect(`${hourLabel(23)}–${hourLabel(2)}`).toBe('11 PM–2 AM');
  });
});

describe('dueDeparture', () => {
  it('is silent at 8 PM when the hour was stored as 8', () => {
    // the reported failure, pinned: at 20:00 an 08:00 briefing is twelve hours
    // past its window and correctly says nothing
    expect(dueDeparture(friday(20), at('home', 8))).toBeNull();
  });

  it('is due at 8 PM when the hour was stored as 20', () => {
    expect(dueDeparture(friday(20), at('home', 20))?.placeId).toBe('home');
  });

  it('picks the office at 7 PM and home at 8 AM on the same settings', () => {
    // the reason a departure is a list: both are on, and each has to win its own
    // hour without the other interfering
    const both: CommuteSettings = {
      ...DEFAULT_COMMUTE,
      departures: [
        { placeId: 'home', label: 'Home', on: true, hour: 8, minute: 0 },
        { placeId: 'office', label: 'Office', on: true, hour: 19, minute: 0 },
      ],
    };
    expect(dueDeparture(friday(8), both)?.placeId).toBe('home');
    expect(dueDeparture(friday(19), both)?.placeId).toBe('office');
    expect(dueDeparture(friday(14), both)).toBeNull();
  });

  it('opens half an hour early and closes at the time itself', () => {
    /**
     * Before the time, never after. Asked for on 2026-08-21: a 7 PM departure should
     * be briefed somewhere in 6:30–7:00.
     *
     * It used to run to +30, and the gateway went further — at the time or up to
     * twenty minutes after, on the reasoning that an early warning is worth less.
     * That was backwards: **a briefing that arrives as you reach the door is too late
     * to change what you pick up.** An umbrella is decided before the shoes are on.
     */
    const s = at('office', 19);
    expect(dueDeparture(friday(18, 30), s)).not.toBeNull();
    expect(dueDeparture(friday(19, 0), s)).not.toBeNull();
    expect(dueDeparture(friday(18, 29), s)).toBeNull();
    // past the time the advice is about a walk already underway
    expect(dueDeparture(friday(19, 1), s)).toBeNull();
  });

  it('says nothing on a Saturday by default', () => {
    expect(dueDeparture(saturday(8), at('home', 8))).toBeNull();
  });

  it('runs on a Saturday that has been switched on, leaving Sunday off', () => {
    // the special case he asked for: a worked Saturday must not drag Sunday with it
    const s = { ...at('home', 8), days: [false, true, true, true, true, true, true] };
    expect(dueDeparture(saturday(8), s)?.placeId).toBe('home');
    expect(dueDeparture(new Date(2026, 7, 16, 8), s)).toBeNull();
  });

  it('ignores a departure that is switched off', () => {
    expect(dueDeparture(friday(8), { ...at('home', 8), departures: DEFAULT_COMMUTE.departures })).toBeNull();
  });
});

describe('alreadyBriefed', () => {
  it('does not let the morning briefing silence the evening one', () => {
    // a single day-stamp was enough while there was one time; with two it would
    // look exactly like the evening briefing being broken, and only ever after the
    // morning had worked
    return markBriefed('home', '2026-08-14').then(async () => {
      expect(await alreadyBriefed('home', '2026-08-14')).toBe(true);
      expect(await alreadyBriefed('office', '2026-08-14')).toBe(false);
    });
  });

  it('forgets yesterday', async () => {
    await markBriefed('home', '2026-08-13');
    expect(await alreadyBriefed('home', '2026-08-14')).toBe(false);
  });

  it('treats the pre-departures value as not yet briefed', async () => {
    // the old shape was a bare `YYYY-MM-DD` string, which does not parse as JSON —
    // at worst one extra briefing arrives on the day of the upgrade
    await AsyncStorage.setItem('jarvis_commute_sent', '2026-08-14');
    expect(await alreadyBriefed('home', '2026-08-14')).toBe(false);
  });
});

describe('dueToday', () => {
  const settings = (departures: unknown[], days = [true, true, true, true, true, true, true]) =>
    AsyncStorage.setItem('jarvis_commute', JSON.stringify({ departures, days }));

  // 2026-08-20 is a Thursday
  const on = (hour: number, minute: number, label: string, placeId = label.toLowerCase()) => ({
    placeId,
    label,
    on: true,
    hour,
    minute,
  });

  it('names the next one still to come', async () => {
    await settings([on(8, 0, 'Home'), on(18, 30, 'Office')]);
    expect(await dueToday(new Date(2026, 7, 20, 11, 0))).toEqual({ hour: 18, minute: 30, label: 'Office' });
  });

  it('takes the earliest of several rather than the first listed', async () => {
    await settings([on(18, 30, 'Office'), on(8, 0, 'Home')]);
    expect(await dueToday(new Date(2026, 7, 20, 6, 0))).toEqual({ hour: 8, minute: 0, label: 'Home' });
  });

  /**
   * Announcing one already sent reads as a promise that was kept an hour ago,
   * which is worse than saying nothing at all.
   */
  it('says nothing once the last one today is behind us', async () => {
    await settings([on(8, 0, 'Home'), on(18, 30, 'Office')]);
    expect(await dueToday(new Date(2026, 7, 20, 19, 0))).toBeNull();
  });

  it('ignores a departure that is switched off', async () => {
    await settings([{ ...on(18, 30, 'Office'), on: false }]);
    expect(await dueToday(new Date(2026, 7, 20, 11, 0))).toBeNull();
  });

  it('says nothing on a day that is switched off', async () => {
    await settings([on(18, 30, 'Office')], [true, true, true, true, false, true, true]);
    expect(await dueToday(new Date(2026, 7, 20, 11, 0))).toBeNull();
  });
});

describe('loadCommute', () => {
  it('carries a stored single time over to the departure from home', async () => {
    // dropping it would make the feature look like it forgot on an app update
    await AsyncStorage.setItem(
      'jarvis_commute',
      JSON.stringify({ on: true, hour: 8, minute: 30, weekdaysOnly: true })
    );
    const s = await loadCommute();
    const home = s.departures.find((d) => d.placeId === 'home');
    expect(home).toMatchObject({ on: true, hour: 8, minute: 30 });
    expect(s.departures.find((d) => d.placeId === 'office')?.on).toBe(false);
    expect(s.days).toEqual([false, true, true, true, true, true, false]);
  });

  it('reads a legacy every-day setting as all seven days', async () => {
    await AsyncStorage.setItem('jarvis_commute', JSON.stringify({ on: true, hour: 9, weekdaysOnly: false }));
    expect((await loadCommute()).days).toEqual([true, true, true, true, true, true, true]);
  });

  it('round-trips both departures and a worked Saturday', async () => {
    const s: CommuteSettings = {
      departures: [
        { placeId: 'home', label: 'Home', on: true, hour: 8, minute: 0 },
        { placeId: 'office', label: 'Office', on: true, hour: 19, minute: 0 },
      ],
      days: [false, true, true, true, true, true, true],
    };
    await saveCommute(s);
    expect(await loadCommute()).toEqual(s);
  });

  it('replaces a short day array rather than indexing off the end of it', async () => {
    // a missing day indexes to undefined, which is falsy — a briefing switched off
    // by a storage bug, which is the exact class of failure this feature keeps
    // having
    await AsyncStorage.setItem('jarvis_commute', JSON.stringify({ departures: [], days: [true, true] }));
    expect((await loadCommute()).days).toHaveLength(7);
  });

  it('falls back to the defaults on unreadable storage', async () => {
    await AsyncStorage.setItem('jarvis_commute', 'not json');
    expect(await loadCommute()).toEqual(DEFAULT_COMMUTE);
  });
});

/**
 * Why a briefing that "worked" was silent for four days.
 *
 * `commuteBriefing` returned `Briefing | null`, and the task read null as "the
 * weather is unremarkable, say nothing" — then wrote the once-a-day marker. But
 * null was also what a failed `fetch` returned, and on the test phone the
 * headless task has no network at all: `dumpsys jobscheduler` reports
 * `Network: 106 (blocked=REASON_APP_BACKGROUND|REASON_APP_STANDBY)` for this uid.
 *
 * So a blocked lookup marked the departure briefed and guaranteed silence until
 * tomorrow, when it would do the same again. Every failure mode reported success,
 * which is why the feature looked unfixable rather than broken.
 *
 * The three outcomes have to be distinguishable: something to say, nothing to say,
 * and could not find out.
 */
describe('commuteBriefing outcomes', () => {
  const home: Departure = { placeId: 'home', label: 'Home', on: true, hour: 8, minute: 0 };
  /** the Friday the rest of this file uses, so `dayKey` matches the rows below */
  const when = friday(8, 0);

  type Row = { h: number; temp: number; chance: number; mm: number; wind: number; code: number };
  const mild = (h: number): Row => ({ h, temp: 28, chance: 5, mm: 0, wind: 6, code: 1 });
  const wet = (h: number): Row => ({ h, temp: 28, chance: 80, mm: 3.2, wind: 6, code: 61 });
  // one row per branch of the advice, each a clear step past its threshold so a
  // later tweak to HOT_C or WINDY_KMH moves the line without silencing a test
  const hot = (h: number): Row => ({ h, temp: 41, chance: 5, mm: 0, wind: 6, code: 1 });
  const cold = (h: number): Row => ({ h, temp: 8, chance: 5, mm: 0, wind: 6, code: 1 });
  const windy = (h: number): Row => ({ h, temp: 28, chance: 5, mm: 0, wind: 47, code: 1 });
  const stormy = (h: number): Row => ({ h, temp: 28, chance: 80, mm: 3.2, wind: 6, code: 95 });

  const payload = (rows: Row[]) => ({
    hourly: {
      time: rows.map((r) => `2026-08-14T${String(r.h).padStart(2, '0')}:00`),
      temperature_2m: rows.map((r) => r.temp),
      precipitation_probability: rows.map((r) => r.chance),
      precipitation: rows.map((r) => r.mm),
      weather_code: rows.map((r) => r.code),
      wind_speed_10m: rows.map((r) => r.wind),
    },
  });

  const serve = (body: unknown, ok = true) => {
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      .mockResolvedValue({ ok, json: async () => body });
  };

  afterEach(() => {
    delete (globalThis as unknown as { fetch?: unknown }).fetch;
  });

  it('says it could not find out when the lookup throws, rather than reporting fine weather', async () => {
    // the headless task on a phone in the RARE standby bucket, which is the real
    // device state — not a hypothetical
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('Network request failed'));
    const out = await commuteBriefing(22.57, 88.36, home, when);
    expect(out.state).toBe('unavailable');
  });

  it('says it could not find out on a non-200, which is not the same as nothing to report', async () => {
    serve({}, false);
    expect((await commuteBriefing(22.57, 88.36, home, when)).state).toBe('unavailable');
  });

  it('says it could not find out when the forecast body carries no hours', async () => {
    serve({ hourly: { time: [] } });
    expect((await commuteBriefing(22.57, 88.36, home, when)).state).toBe('unavailable');
  });

  it('says it could not find out when today has no row for the departure hour', async () => {
    // a forecast that answered, but not about the window being asked about — still
    // an absence of knowledge, not a quiet morning
    serve(payload([mild(3), mild(4)]));
    expect((await commuteBriefing(22.57, 88.36, home, when)).state).toBe('unavailable');
  });

  it('reports a clear morning as clear, so the day can be marked done', async () => {
    serve(payload([mild(8), mild(9), mild(10)]));
    expect((await commuteBriefing(22.57, 88.36, home, when)).state).toBe('clear');
  });

  it('returns the briefing when there is something worth carrying an umbrella for', async () => {
    serve(payload([wet(8), mild(9), mild(10)]));
    const out = await commuteBriefing(22.57, 88.36, home, when);
    expect(out.state).toBe('briefing');
    if (out.state !== 'briefing') throw new Error('narrowing');
    expect(out.briefing.title).toBe('Before you leave Home, sir');
    expect(out.briefing.body).toContain('umbrella');
    // the window still names both ends with a meridiem, which is the 08-14 fix
    expect(out.briefing.body).toContain('8 AM–11 AM');
  });

  /**
   * A quiet day is announced too, as of 2026-08-18.
   *
   * It used to stay silent, on the reasoning that a daily "it's fine" is one you
   * stop reading. Overruled: on the 18th an unremarkable evening produced no
   * notification, that was *correct*, and it still read as the feature being broken
   * — as it had for four days. A briefing indistinguishable from a broken briefing
   * is not doing its job.
   */
  it('announces a quiet day rather than saying nothing at all', async () => {
    serve(payload([mild(8), mild(9), mild(10)]));
    const out = await commuteBriefing(22.57, 88.36, home, when);
    if (out.state !== 'clear') throw new Error('narrowing');
    expect(out.briefing.title).toBe('Nothing in your way from Home, sir');
    expect(out.briefing.body).toContain('Nothing to carry');
  });

  it('puts the measured figures in the all-clear, so it can be disagreed with', async () => {
    // "nothing to worry about" with no numbers behind it is the same unfalsifiable
    // silence with a buzz attached
    serve(payload([mild(8), mild(9), mild(10)]));
    const out = await commuteBriefing(22.57, 88.36, home, when);
    if (out.state !== 'clear') throw new Error('narrowing');
    expect(out.briefing.body).toContain('28°C');
    expect(out.briefing.body).toContain('5% chance of rain');
    expect(out.briefing.body).toContain('6 km/h');
    expect(out.briefing.body).toContain('8 AM–11 AM');
  });

  /**
   * The voice, pinned. Its rules are in the doc comment above `notes` in
   * `commute.ts`; these are the ones a rewrite can break silently.
   */
  it('spends its one “sir” in the title, because it is punctuation and not deference', async () => {
    serve(payload([stormy(8), mild(9), mild(10)]));
    const out = await commuteBriefing(22.57, 88.36, home, when);
    if (out.state !== 'briefing') throw new Error('narrowing');
    expect(out.briefing.title).toContain('sir');
    // repeated in every clause it stops reading as dry and starts reading as
    // servile, which is a different character than the one that was asked for
    expect(out.briefing.body).not.toContain('sir');
  });

  /**
   * The figure comes first and the remark follows it, in every branch.
   *
   * Android truncates a notification body in the shade, so whatever survives the
   * cut has to be the half you can act on. These assertions are on the ORDER, not
   * just the presence: a rewrite that opens with the joke passes a `toContain`
   * check and fails the person reading it at 6 AM.
   */
  const branches: Array<{ name: string; row: (h: number) => Row; figure: string; remark: string }> = [
    { name: 'rain', row: wet, figure: '80% chance', remark: 'umbrella' },
    { name: 'heat', row: hot, figure: '41°C', remark: 'hospital' },
    { name: 'cold', row: cold, figure: '8°C', remark: 'jacket' },
    { name: 'wind', row: windy, figure: '47 km/h', remark: 'hair' },
  ];

  for (const b of branches) {
    it(`states the ${b.name} measurement before it says anything about it`, async () => {
      serve(payload([b.row(8), mild(9), mild(10)]));
      const out = await commuteBriefing(22.57, 88.36, home, when);
      if (out.state !== 'briefing') throw new Error('narrowing');
      const { body } = out.briefing;
      expect(body).toContain(b.figure);
      expect(body).toContain(b.remark);
      expect(body.indexOf(b.figure)).toBeLessThan(body.indexOf(b.remark));
    });
  }

  it('names the thunderstorm and still gives the hour', async () => {
    serve(payload([stormy(8), mild(9), mild(10)]));
    const out = await commuteBriefing(22.57, 88.36, home, when);
    if (out.state !== 'briefing') throw new Error('narrowing');
    expect(out.briefing.body).toContain('Thunderstorms forecast');
    expect(out.briefing.body).toContain('8 AM–11 AM');
  });

  it('never exclaims, in any branch, including the quiet one', async () => {
    // understatement is the whole instrument; an exclamation mark is the one
    // punctuation mark that cannot be read dryly
    for (const rows of [[wet(8)], [hot(8)], [cold(8)], [windy(8)], [stormy(8)], [mild(8)]]) {
      serve(payload([...rows, mild(9), mild(10)]));
      const out = await commuteBriefing(22.57, 88.36, home, when);
      if (out.state === 'unavailable') throw new Error('narrowing');
      expect(out.briefing.title).not.toContain('!');
      expect(out.briefing.body).not.toContain('!');
    }
  });
});

/**
 * Whether the gateway is arming the briefing, so the phone does not post it too.
 *
 * Both senders fired on 2026-08-21 and the same briefing arrived twice — the
 * gateway push and the phone's own WorkManager task, each with its own once-a-day
 * marker and neither aware of the other. The phone was meant to be a fallback and
 * had never been gated, so it was a second sender.
 *
 * The direction of the failure is chosen deliberately: an unreadable or missing
 * stamp reads as "not armed", so the phone posts. A duplicate is an annoyance; a
 * morning with no briefing at all is the feature not existing.
 */
describe('whether the gateway holds the schedule', () => {
  const now = new Date(2026, 7, 21, 8, 5);
  const hoursAgo = (h: number) => now.getTime() - h * 3_600_000;

  it('is not armed before a schedule has ever been uploaded', async () => {
    expect(await cloudArmed(now)).toBe(false);
  });

  it('is armed just after an upload succeeded', async () => {
    await markCloudArmed(hoursAgo(0));
    expect(await cloudArmed(now)).toBe(true);
  });

  it('is still armed the next morning, because the gateway keeps the schedule', async () => {
    // the app is not opened every day, and the gateway does not need it to be
    await markCloudArmed(hoursAgo(20));
    expect(await cloudArmed(now)).toBe(true);
  });

  it('stops trusting an upload older than the window', async () => {
    // a gateway that has not been reachable for two days may have been redeployed
    // and wiped — the phone takes the briefing back rather than assuming
    await markCloudArmed(hoursAgo(CLOUD_TTL_HOURS + 1));
    expect(await cloudArmed(now)).toBe(false);
  });

  it('is not armed when the stamp is unreadable, so the phone still posts', async () => {
    await AsyncStorage.setItem('jarvis_commute_cloud', 'not a number');
    expect(await cloudArmed(now)).toBe(false);
  });

  it('is not armed by a stamp from the future, which is a clock that moved', async () => {
    await markCloudArmed(now.getTime() + 86_400_000);
    expect(await cloudArmed(now)).toBe(false);
  });
});

/**
 * What the phone may *claim* about the gateway, which is a narrower thing than what
 * the task decides.
 *
 * These exist because the status panel read `ON THIS PHONE` — asserting the gateway
 * did not hold the schedule — after a run of workspace-only sessions. The stamp is
 * written only by `syncCommute`, and that effect returns early unless the link is
 * `cloud`, so a week on the LAN ages it out while the gateway may be armed perfectly
 * well. `cloudArmed` collapsing that into `false` is right for the task and wrong for
 * a row of text.
 *
 * The task's own behaviour must not move: a stale stamp still means the phone posts.
 */
describe('what the phone can honestly claim about the gateway', () => {
  const now = new Date(2026, 7, 21, 8, 5);
  const hoursAgo = (h: number) => now.getTime() - h * 3_600_000;

  it('reads armed while the stamp is fresh', async () => {
    await markCloudArmed(hoursAgo(1));
    await expect(cloudArmedState(now)).resolves.toBe('armed');
  });

  it('reads stale — not never — once the stamp ages out', async () => {
    await markCloudArmed(hoursAgo(CLOUD_TTL_HOURS + 1));
    await expect(cloudArmedState(now)).resolves.toBe('stale');
  });

  it('reads never when no upload has ever been stamped', async () => {
    await expect(cloudArmedState(now)).resolves.toBe('never');
  });

  it('reads never when the stamp is unreadable, because that is not evidence either way', async () => {
    await AsyncStorage.setItem('jarvis_commute_cloud', 'not a number');
    await expect(cloudArmedState(now)).resolves.toBe('never');
  });

  it('treats a clock that moved backwards as stale, not armed', async () => {
    // the age is meaningless, and meaningless must not read as proved
    await markCloudArmed(now.getTime() + 86_400_000);
    await expect(cloudArmedState(now)).resolves.toBe('stale');
  });

  it('keeps the boolean gate agreeing with the tri-state', async () => {
    // the whole point: the task still stands the gateway down, the panel stops
    // asserting something it cannot know
    await markCloudArmed(hoursAgo(CLOUD_TTL_HOURS + 1));
    expect(await cloudArmed(now)).toBe(false);
    await expect(cloudArmedState(now)).resolves.toBe('stale');
  });
});
