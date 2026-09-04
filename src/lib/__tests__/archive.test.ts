import {
  importSummary,
  matchVisits,
  unnamedClusters,
  visitRange,
  withoutNear,
} from '../archive';
import type { Visit } from '../archive';
import type { KnownPlace } from '../knownPlaces';

/**
 * Which visits from a Timeline export are worth keeping, and what to ask about the rest.
 *
 * The export holds 4,000 visits across 238 distinct places, of which he has named
 * eleven. A visit only ever becomes a sighting inside a circle he named himself — the
 * same rule `nameFor` already uses — and the other 227 clusters become questions, never
 * guesses. Nothing here talks to the network, and that is the decision, not an omission.
 */

const OFFICE: KnownPlace = {
  id: 'office',
  label: 'Office',
  lat: 22.57705,
  lon: 88.43435,
  area: 'Bidhannagar, West Bengal',
};

const HOME: KnownPlace = {
  id: 'home',
  label: 'Home',
  lat: 22.81515,
  lon: 88.37191,
  area: 'Garulia, West Bengal',
};

const at = (iso: string) => new Date(iso).getTime();

const visit = (
  lat: number,
  lon: number,
  start: string,
  end: string,
  hint?: 'home' | 'work'
): Visit =>
  hint
    ? { lat, lon, start: at(start), end: at(end), hint }
    : { lat, lon, start: at(start), end: at(end) };

/** a visit to the office on a given date */
const office = (date: string, from = '09:49', to = '19:05') =>
  visit(OFFICE.lat, OFFICE.lon, `${date}T${from}:00+05:30`, `${date}T${to}:00+05:30`);

describe('a visit inside a circle he named', () => {
  it('becomes an arrival and a departure', () => {
    expect(matchVisits([office('2026-03-02')], [OFFICE, HOME])).toEqual([
      { place: 'Office', at: at('2026-03-02T09:49:00+05:30'), via: 'import-enter' },
      { place: 'Office', at: at('2026-03-02T19:05:00+05:30'), via: 'import-exit' },
    ]);
  });

  it('keeps a visit exactly on the radius, since the rule is inclusive', () => {
    // 0.12 km due north of the office: nameFor treats the boundary as inside, and two
    // different answers for the same coordinate is the bug this test exists to stop
    const onEdge = { lat: OFFICE.lat + 0.12 / 111.32, lon: OFFICE.lon };
    const rows = matchVisits(
      [
        visit(
          onEdge.lat,
          onEdge.lon,
          '2026-03-02T09:49:00+05:30',
          '2026-03-02T19:05:00+05:30'
        ),
      ],
      [OFFICE]
    );
    expect(rows).toHaveLength(2);
  });

  it('throws away a visit to somewhere he has never named', () => {
    // 227 of the 238 clusters in the export are unnamed. They become questions in
    // unnamedClusters, never sightings with a guessed label
    const far = visit(22.5, 88.0, '2026-03-02T09:00:00+05:30', '2026-03-02T10:00:00+05:30');
    expect(matchVisits([far], [OFFICE])).toEqual([]);
  });

  it('splits a visit that runs past midnight across two days', () => {
    const rows = matchVisits(
      [visit(HOME.lat, HOME.lon, '2026-03-02T23:40:00+05:30', '2026-03-03T00:20:00+05:30')],
      [HOME]
    );
    expect(new Date(rows[0].at).getDate()).toBe(2);
    expect(new Date(rows[1].at).getDate()).toBe(3);
  });

  it('has nothing to say about no visits', () => {
    expect(matchVisits([], [OFFICE])).toEqual([]);
    expect(matchVisits([office('2026-03-02')], [])).toEqual([]);
  });
});

describe('not writing a second row for one event', () => {
  it('drops an imported row within five minutes of one already held', () => {
    // the geofence recorded Sealdah at 9:23 and the export says 9:21 — one arrival,
    // and two rows for it would make one morning look like two
    const rows = matchVisits([office('2026-09-03', '09:21', '19:05')], [OFFICE]);
    const existing = [
      { place: 'Office', at: at('2026-09-03T09:23:00+05:30'), via: 'enter' as const },
    ];
    expect(withoutNear(rows, existing).map((r) => r.via)).toEqual(['import-exit']);
  });

  it('keeps a row the store has nothing near', () => {
    expect(withoutNear(matchVisits([office('2026-03-02')], [OFFICE]), [])).toHaveLength(2);
  });
});

describe('what he is shown before anything is written', () => {
  it('counts days, not visits, and gives the usual arrival', () => {
    // four visits across three days is three days of evidence. A count of visits would
    // read as more history than there is, which is the whole failure mode here
    const visits = [
      office('2026-03-02', '09:40', '13:00'),
      office('2026-03-02', '14:00', '19:05'),
      office('2026-03-03', '09:58', '19:00'),
      office('2026-03-04', '09:49', '19:00'),
    ];
    expect(importSummary(visits, [OFFICE, HOME])).toEqual([
      { place: 'Office', visits: 4, days: 3, hour: 9 * 60 + 49 },
    ]);
  });

  it('ranks the places by how much history each brings', () => {
    const visits = [
      office('2026-03-02'),
      office('2026-03-03'),
      visit(HOME.lat, HOME.lon, '2026-03-02T20:55:00+05:30', '2026-03-03T08:10:00+05:30'),
    ];
    expect(importSummary(visits, [OFFICE, HOME]).map((r) => r.place)).toEqual([
      'Office',
      'Home',
    ]);
  });

  it('says nothing about a place with no visits in the file', () => {
    expect(importSummary([office('2026-03-02')], [OFFICE, HOME]).map((r) => r.place)).toEqual(
      ['Office']
    );
  });

  it('gives the range of the whole file', () => {
    expect(visitRange([office('2026-03-04'), office('2026-03-02')])).toEqual({
      from: at('2026-03-02T09:49:00+05:30'),
      to: at('2026-03-04T19:05:00+05:30'),
    });
    expect(visitRange([])).toBeNull();
  });
});

describe('the places he has visited hundreds of times and never named', () => {
  /** n visits to one coordinate, one a day, at about eight in the evening */
  const many = (lat: number, lon: number, n: number, hint?: 'home' | 'work'): Visit[] =>
    Array.from({ length: n }, (_, i) => {
      const start = at('2025-03-08T20:00:00+05:30') + i * 24 * 60 * 60 * 1000;
      return hint
        ? { lat, lon, start, end: start + 3600_000, hint }
        : { lat, lon, start, end: start + 3600_000 };
    });

  it('proposes an unnamed cluster with its count, its days and its usual hour', () => {
    const c = unnamedClusters(many(22.9, 88.4, 40), [OFFICE, HOME]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ visits: 40, days: 40 });
    expect(c[0].hour).toBe(20 * 60);
  });

  it("passes on Google's own guess when it has one, since that arrives free", () => {
    // INFERRED_HOME and INFERRED_WORK are in the file. They are a hint on a question,
    // never a label on a place: a place is named by a person
    const [c] = unnamedClusters(many(22.9, 88.4, 40, 'home'), [OFFICE]);
    expect(c.hint).toBe('home');
  });

  it('never proposes somewhere he has already named', () => {
    expect(unnamedClusters([office('2026-03-02')], [OFFICE])).toEqual([]);
  });

  it('ignores a cluster too thin to be worth a question', () => {
    // a handful of visits to a shop is not a place worth naming, and a list of two
    // hundred questions is a list nobody answers
    expect(unnamedClusters(many(22.9, 88.4, 3), [OFFICE])).toEqual([]);
  });

  it('ranks them so the biggest question is the first one asked', () => {
    const mixed = [...many(22.9, 88.4, 40), ...many(23.1, 88.6, 80)];
    expect(unnamedClusters(mixed, [OFFICE]).map((c) => c.visits)).toEqual([80, 40]);
  });
});
