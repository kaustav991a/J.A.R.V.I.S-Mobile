import { openSeenStore } from '../seenStore';
import {
  arrivalHour,
  crossings,
  exitDaysAt,
  forgetImported,
  isCrossing,
  isImported,
  leftBy,
  loadSeen,
  useSeenStore,
} from '../timeline';
import type { Seen } from '../timeline';

/**
 * Imported history counts, and never poses as measured history.
 *
 * 529 days of imported visits quietly outvoting four days of geofence crossings is
 * this project's oldest mistake in its newest coat — the same shape as "3:40 PM",
 * which was a correct median over data that measured something else.
 */

const NOW = new Date('2026-09-03T20:00:00+05:30');
const DAY = 24 * 60 * 60 * 1000;

/** a sighting on the Nth earlier day, at a given hour and minute */
const day = (
  back: number,
  hour: number,
  minute: number,
  via?: Seen['via'],
  place = 'Office'
): Seen => {
  const d = new Date(NOW.getTime() - back * DAY);
  d.setHours(hour, minute, 0, 0);
  return via ? { place, at: d.getTime(), via } : { place, at: d.getTime() };
};

beforeEach(async () => {
  useSeenStore(await openSeenStore(':memory:'));
});

afterEach(() => useSeenStore(null));

describe('telling the two kinds apart', () => {
  it('calls a geofence crossing a crossing, and an import not one', () => {
    expect(isCrossing(day(1, 9, 0, 'enter'))).toBe(true);
    expect(isCrossing(day(1, 9, 0, 'exit'))).toBe(true);
    expect(isCrossing(day(1, 9, 0, 'import-enter'))).toBe(false);
    expect(isCrossing(day(1, 9, 0))).toBe(false);
  });

  it('calls both halves of an import an import', () => {
    expect(isImported(day(1, 9, 0, 'import-enter'))).toBe(true);
    expect(isImported(day(1, 9, 0, 'import-exit'))).toBe(true);
    expect(isImported(day(1, 9, 0, 'exit'))).toBe(false);
  });
});

describe('the Crossings recorded row', () => {
  it('shows what the geofence did, not what was imported', () => {
    // 8,000 imported rows in the one diagnostic that made the geofence trustworthy
    // would destroy it, and it is the row that caught three bugs in an hour
    const seen = [day(1, 9, 0, 'import-enter'), day(1, 18, 30, 'exit')];
    expect(crossings(seen, NOW).map((s) => s.via)).toEqual(['exit']);
  });
});

describe('when he usually leaves, and where that figure came from', () => {
  const fourExits = [1, 2, 3, 4].map((b) => day(b, 19, 0, 'exit'));
  const fourImports = [10, 11, 12, 13].map((b) => day(b, 18, 40, 'import-exit'));

  it('is measured when the boundary was actually crossed', () => {
    expect(leftBy(fourExits, 'Office', NOW)).toMatchObject({
      measured: true,
      source: 'crossing',
    });
  });

  it('counts imported departures, and says they are imported', () => {
    const r = leftBy(fourImports, 'Office', NOW);
    expect(r?.minute).toBe(18 * 60 + 40);
    expect(r).toMatchObject({ measured: false, source: 'import' });
  });

  it('prefers the crossings when it has enough of them', () => {
    expect(leftBy([...fourImports, ...fourExits], 'Office', NOW)).toMatchObject({
      minute: 19 * 60,
      measured: true,
      source: 'crossing',
    });
  });

  it('falls back to app-opens and calls them what they are', () => {
    const opens = [1, 2, 3, 4].map((b) => day(b, 15, 40));
    expect(leftBy(opens, 'Office', NOW)).toMatchObject({
      measured: false,
      source: 'app-open',
    });
  });
});

describe('when he usually arrives', () => {
  it('counts imported arrivals and never calls them measured', () => {
    // the export says 09:49 across 344 days; the app said 11:51 from four app-opens
    const imports = [10, 11, 12, 13].map((b) => day(b, 9, 49, 'import-enter'));
    expect(arrivalHour(imports, 'Office', NOW)).toMatchObject({
      minute: 9 * 60 + 49,
      measured: false,
      source: 'import',
    });
  });
});

describe('how many days are behind a departure figure', () => {
  it('counts imported days too, since the figure rests on them', () => {
    const rows = [day(1, 19, 0, 'exit'), day(10, 18, 40, 'import-exit')];
    expect(exitDaysAt(rows, 'Office', NOW)).toBe(2);
  });
});

describe('taking an import back', () => {
  it('removes every imported row and leaves the rest untouched', async () => {
    // a bad import must be one gesture to undo, not a reinstall
    const s = await openSeenStore(':memory:');
    useSeenStore(s);
    await s.putMany([
      day(1, 9, 0, 'enter'),
      day(1, 18, 30, 'exit'),
      day(2, 12, 0),
      day(300, 9, 49, 'import-enter'),
      day(300, 18, 40, 'import-exit'),
    ]);
    expect(await forgetImported()).toBe(2);
    // loadSeen is oldest-first, and day 2's app-open predates day 1's crossings
    expect((await loadSeen()).map((r) => r.via)).toEqual([undefined, 'enter', 'exit']);
  });
});
