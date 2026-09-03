# Archive import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a 47 MB Google Timeline export into seventeen months of sightings the habit figures can use, without the file ever leaving the phone and without imported history ever posing as measured history.

**Architecture:** A Kotlin streaming parser (`android.util.JsonReader`) walks the export in constant memory and hands JavaScript about 4,000 visits as four numbers each — the 47 MB never crosses the bridge. Matching happens in JavaScript with the code that already names places (`distanceKm <= AT_PLACE_KM`), so an import can only land in a circle already named. Everything is shown before anything is written, and one gesture takes it all back.

**Tech Stack:** Expo SDK 57, `expo-modules-core` Kotlin module, `expo-document-picker`, expo-sqlite (the `sighting` table from Plan A), React Native.

**Spec:** `docs/superpowers/specs/2026-09-03-archive-import-design.md`, which follows the spike in `docs/superpowers/specs/2026-09-03-archive-import-spike.md`.

**Depends on:** `docs/superpowers/plans/2026-09-03-sightings-to-sqlite.md` — **complete and proved on the device 2026-09-03** (138 rows, 12 days). Without that table this import truncates to 1,200 rows or dies on the next write.

## Global Constraints

- **`AT_PLACE_KM = 0.12`** is the match radius, from `src/lib/knownPlaces.ts`. Do not introduce a second one.
- **The file never leaves the phone**, and is never copied into the app. Read once through the `content://` URI the user picked, matched, discarded.
- **No network call, no API key, no Places Details lookup.** Naming is by consent; see Task 5. This is the line every feature in this app has held.
- **Imported sightings never report as `measured`.** `measured: true` means *a geofence boundary was crossed*, and nothing else may claim it.
- **The Crossings recorded row shows crossings only.** It is the window onto what the geofence did; 8,000 imported rows in it would destroy the only diagnostic that made the geofence trustworthy.
- **A new directory under `modules/` moves the OTA fingerprint**, and so does a new native dependency. Everything in Tasks 1 and 2 is JavaScript and ships over the air **before** the build. Task 3 is the build.
- **The installed APK is signed with `android/app/debug.keystore`** (cert `fac61745dc09`). Build locally with `./gradlew assembleRelease` and install with `adb install -r`. An EAS build carries a different key and would need an uninstall, which costs the journal's 52,000 usage moments and the chat archive.
- **Back up `android/app/debug.keystore` before any `prebuild`**, and re-bake the fingerprint into `android/app/src/main/res/values/strings.xml` by hand — `prebuild` writes the literal `file:fingerprint` every time.
- **Never `requireNativeModule` at import scope.** The JavaScript ships hours before the APK; a module-scope require crashes the whole app at launch over a feature that reads a file.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/lib/timeline.ts` (modify) | `Seen.via` widened; `isCrossing()` named once; habit figures count imports and report their source; `forgetImported()` |
| `src/lib/seenStore.ts` (modify) | `dropImported()`, and `putMany()` for a bulk insert that is not 8,000 round trips |
| `src/lib/archive.ts` (create) | Pure: a visit becomes a sighting, or becomes a proposal. No I/O, no native, no React |
| `src/lib/archiveImport.ts` (create) | The orchestration: read the file, match, write, count. The only file touching both the native module and the store |
| `modules/timeline-import/` (create) | The Kotlin streaming parser and its lazy wrapper |
| `src/screens/ImportScreen.tsx` (create) | Pick, preview, confirm, name the unnamed, undo |
| `src/screens/PlacesScreen.tsx` (modify) | One row saying what is imported, with FORGET |
| `src/navigation/RootNavigator.tsx` (modify) | The screen, in the Settings stack beside `Places` |

**Why `archive.ts` is separate from `archiveImport.ts`.** Everything hard about this
feature is arithmetic over a list — which visits match, which clusters are worth
proposing, what to say about them — and none of it needs a file, a database or a phone.
Screen tests in this repo trip *"Invalid hook call"* in the navigation mock, so logic
that lives in a screen is logic that cannot be tested. `archive.ts` is where the
decisions live and it is tested exhaustively; `archiveImport.ts` stays thin enough to
read in one sitting.

---

### Task 1: `via` learns the difference between measured and imported

**Files:**
- Modify: `src/lib/timeline.ts` — the `Seen` type (~line 66), `crossings` (~384), `forgetCrossing` (~404), `leftBy` (~462), `exitDaysAt` (~503), `arrivalHour` (~688)
- Modify: `src/lib/seenStore.ts` — add `putMany` and `dropImported`
- Modify: `src/lib/geofence.ts` — `alreadyInside` (~296)
- Test: `src/lib/__tests__/imported.test.ts` (create)

**Interfaces:**
- Consumes: `SeenStore` and `Seen` as Plan A left them.
- Produces:
  - `Seen.via?: 'enter' | 'exit' | 'import-enter' | 'import-exit'`
  - `isCrossing(s: Seen): boolean` — true only for `enter` and `exit`
  - `isImported(s: Seen): boolean`
  - `Source = 'crossing' | 'import' | 'app-open'`
  - `leftBy` returns `{ minute: number; measured: boolean; source: Source } | null`
  - `arrivalHour` returns `{ minute: number; measured: boolean; source: 'crossing' | 'import' } | null`
  - `forgetImported(): Promise<number>` from `src/lib/timeline.ts` — how many rows went
  - `SeenStore.putMany: (rows: Seen[]) => Promise<void>`
  - `SeenStore.dropImported: () => Promise<number>`

**Two decisions this task makes that the spec left open.**

The spec says `via: 'import'`, one value. **That cannot work.** An import writes a row
for the arrival *and* a row for the departure, and with one value nothing can tell them
apart — which is exactly the distinction `leftBy` and `arrivalHour` are built on. So it
is **two** values, `'import-enter'` and `'import-exit'`, mirroring the pair that exists.

And **every existing truthiness check on `.via` silently means *"a geofence
crossing"***. There are three: the Crossings recorded row, `forgetCrossing`, and
`alreadyInside` in `geofence.ts`. Left alone, an import would put 8,000 rows into the
one diagnostic that made the geofence trustworthy — the row that caught three bugs in
an hour — and `alreadyInside`, which reads the *last* crossing for a place, would
consult a visit Google recorded this morning and then refuse to announce a real
arrival. Narrowing them is not tidying. It is the difference between this feature
working and it breaking two that already do.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/imported.test.ts`:

```ts
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
    const seen = [day(1, 9, 0, 'import-enter'), day(1, 18, 30, 'exit')];
    expect(crossings(seen, NOW).map((s) => s.via)).toEqual(['exit']);
  });
});
```

Then, in the same file:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/lib/__tests__/imported.test.ts`
Expected: FAIL — `isCrossing`, `isImported` and `forgetImported` are not exported, and
`putMany` is not on the store.

- [ ] **Step 3: Widen the type, and name the distinction once**

In `src/lib/timeline.ts`, widen `Seen.via` and put the two guards beside it:

```ts
export type Seen = {
  place: string;
  at: number;
  /**
   * How the sighting was made, absent on everything written before 2026-09-01.
   *
   * `'exit'` and `'enter'` come from a geofence and mean the boundary was actually
   * crossed, whether or not the app was open. `'import-enter'` and `'import-exit'`
   * come from a Google Timeline export — Google's own visit detection, which the
   * spike found agreeing with a recorded crossing to the minute, from two sources
   * that have never met. Good evidence, and still not this device measuring anything.
   * Everything else is an app-open.
   *
   * Two imported values rather than one, because an import writes a row for the
   * arrival and a row for the departure, and telling those apart is the basis of
   * every figure below.
   */
  via?: 'enter' | 'exit' | 'import-enter' | 'import-exit';
};

/**
 * A boundary this device actually watched being crossed.
 *
 * Every check on `.via` being merely truthy used to mean this, back when truthy and
 * crossing were the same thing. They stopped being the same thing the moment an
 * import could write a row, so the meaning is named here once rather than assumed in
 * three places — one of which is the diagnostic row that caught three bugs in an hour.
 */
export const isCrossing = (s: Seen): boolean => s.via === 'enter' || s.via === 'exit';

/** from a Timeline export rather than from this phone */
export const isImported = (s: Seen): boolean =>
  s.via === 'import-enter' || s.via === 'import-exit';
```

Then narrow the three truthiness checks:

- `crossings` (~384): `.filter((s) => isCrossing(s) && s.at <= now.getTime())`
- `forgetCrossing` (~404): `.filter((x) => x.at === at && isCrossing(x))`
- `geofence.ts` `alreadyInside` (~296):
  `seen.filter((s) => s.place === label && isCrossing(s)).pop()`, importing
  `isCrossing` from `./timeline`

- [ ] **Step 4: Let the habit figures count imports without claiming them**

`leftBy` and `arrivalHour` are the same shape twice, so write the helper once. Add it
above `leftBy` in `src/lib/timeline.ts`:

```ts
/** which kinds of sighting a figure was built from */
export type Source = 'crossing' | 'import' | 'app-open';

/**
 * The median of one minute per day, across the days a predicate matches.
 *
 * `pick` decides which of a day's several sightings counts — the LAST exit of a day,
 * because stepping out for lunch is not going home; the FIRST arrival, because coming
 * back from lunch is not arriving.
 */
function medianPerDay(
  seen: Seen[],
  place: string,
  now: Date,
  keep: (s: Seen) => boolean,
  pick: 'last' | 'first'
): { minute: number; days: number } | null {
  const today = dayKey(now.getTime());
  const perDay = new Map<string, number>();
  for (const s of seen) {
    if (s.place !== place || !keep(s)) continue;
    const key = dayKey(s.at);
    if (key === today) continue;
    const minute = minuteOfDay(s.at);
    const held = perDay.get(key);
    if (held === undefined || (pick === 'last' ? minute > held : minute < held)) {
      perDay.set(key, minute);
    }
  }
  if (!perDay.size) return null;
  const times = [...perDay.values()].sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  // an even count takes the lower of the two middles, which errs toward saying it
  // earlier rather than later
  return { minute: times.length % 2 ? times[mid] : times[mid - 1], days: perDay.size };
}
```

`leftBy` becomes:

```ts
export function leftBy(
  seen: Seen[],
  place: string,
  now: Date
): { minute: number; measured: boolean; source: Source } | null {
  const crossed = medianPerDay(seen, place, now, (s) => s.via === 'exit', 'last');
  if (crossed && crossed.days >= ENOUGH_PLACE_DAYS) {
    return { minute: crossed.minute, measured: true, source: 'crossing' };
  }

  /**
   * Imports count, and they are not measured.
   *
   * `measured: true` means *this phone watched a boundary being crossed*, and nothing
   * else may claim it — that single word is what stops a sentence being worded as a
   * departure when it is really a bound. The figure is still worth having: the spike
   * found Google's Sealdah arrival matching a recorded crossing to the minute.
   */
  const withImports = medianPerDay(
    seen,
    place,
    now,
    (s) => s.via === 'exit' || s.via === 'import-exit',
    'last'
  );
  if (withImports && withImports.days >= ENOUGH_PLACE_DAYS) {
    return { minute: withImports.minute, measured: false, source: 'import' };
  }

  const floor = usuallyGoneBy(seen, place, now);
  return floor === null ? null : { minute: floor, measured: false, source: 'app-open' };
}
```

`arrivalHour` takes the identical shape with `'enter'` / `'import-enter'` and
`pick: 'first'`, returning `source: 'crossing' | 'import'` — and `null` rather than an
app-open fallback, which it has never had.

`exitDaysAt` counts both kinds:

```ts
    if (s.place !== place || (s.via !== 'exit' && s.via !== 'import-exit')) continue;
```

The days behind a figure are the days the figure rests on, whichever source wrote them.

- [ ] **Step 5: Give the store a bulk insert and an undo**

Add to the `SeenStore` type in `src/lib/seenStore.ts`:

```ts
  /**
   * Write many rows in one transaction.
   *
   * `put` is a statement per row, which is right for one crossing and wrong for eight
   * thousand. An import is one transaction or it is a progress bar nobody asked for.
   */
  putMany: (rows: Seen[]) => Promise<void>;
  /** take every imported row back out, and say how many went */
  dropImported: () => Promise<number>;
```

And to the returned object:

```ts
    async putMany(rows) {
      await db.withTransactionAsync(async () => {
        for (const r of rows) {
          await db.runAsync(
            'INSERT OR IGNORE INTO sighting (at, place, via) VALUES (?, ?, ?)',
            r.at,
            r.place,
            r.via ?? null
          );
        }
      });
    },

    async dropImported() {
      const r = await db.runAsync("DELETE FROM sighting WHERE via LIKE 'import%'");
      return r.changes;
    },
```

Then in `src/lib/timeline.ts`:

```ts
/**
 * Take back everything a Timeline import wrote.
 *
 * One gesture, because an import is eight thousand rows of somebody else's arithmetic
 * and the only honest way to offer that is to make it free to refuse afterwards.
 * Crossings and app-open sightings are untouched.
 */
export async function forgetImported(): Promise<number> {
  try {
    const s = await theStore();
    return s ? await s.dropImported() : 0;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 6: Run the tests, then the suite**

Run: `npx jest src/lib/__tests__/imported.test.ts` — expect 10 passing.
Run: `npx tsc --noEmit`. The habit figures gained a field, which is additive; if a
caller destructures exhaustively, add the field there rather than removing it here.
Run: `npx jest` — green. A suite asserting `leftBy(...)` with `toEqual` on the whole
object needs `source` added. **Do not weaken an assertion:** if a test asserted
`measured: true` for a figure now built from imports, that behaviour is deliberately
gone, and the test should say so in a comment.

- [ ] **Step 7: Commit**

```bash
git add src/lib/timeline.ts src/lib/seenStore.ts src/lib/geofence.ts src/lib/__tests__/imported.test.ts
git commit -m "feat(import): via tells measured from imported, and the three checks that meant crossing now say so"
npx expo-updates fingerprint:generate --platform android
```

The fingerprint **must not move** — this is JavaScript only. Hold the publish until
Task 2 is done; they are one shipment.

---

### Task 2: A visit becomes a sighting, or becomes a question

**Files:**
- Create: `src/lib/archive.ts`
- Test: `src/lib/__tests__/archive.test.ts`

**Interfaces:**
- Consumes: `AT_PLACE_KM`, `distanceKm`, `KnownPlace` from `src/lib/knownPlaces.ts`; `Seen` from `src/lib/timeline.ts`.
- Produces, all pure, all from `src/lib/archive.ts`:
  - `Visit = { lat: number; lon: number; start: number; end: number; hint?: 'home' | 'work' }`
  - `CLUSTER_KM = 0.1` and `PROPOSE_MIN_VISITS = 20`
  - `matchVisits(visits: Visit[], places: KnownPlace[]): Seen[]`
  - `withoutNear(rows: Seen[], existing: Seen[], windowMs?: number): Seen[]`
  - `importSummary(visits: Visit[], places: KnownPlace[]): { place: string; visits: number; days: number; hour: number | null }[]`
  - `unnamedClusters(visits: Visit[], places: KnownPlace[]): Cluster[]` where `Cluster = { lat: number; lon: number; visits: number; days: number; hour: number; hint?: 'home' | 'work' }`
  - `visitRange(visits: Visit[]): { from: number; to: number } | null`

**What this file must not do.** No file reading, no native module, no store, no React,
no `Date.now()`. Every function takes its inputs and returns a value, because this is
where every decision in the feature lives and the phone is a bad place to find out one
of them was wrong.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/archive.test.ts`:

```ts
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
 * Which visits from a Timeline export are worth keeping, and what to ask about the
 * rest.
 *
 * The export holds 4,000 visits across 238 distinct places, of which he has named
 * eleven. A visit only ever becomes a sighting inside a circle he named himself —
 * the same rule `nameFor` already uses — and the other 227 clusters become questions,
 * never guesses. Nothing here talks to the network, and that is the decision, not an
 * omission.
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

const visit = (lat: number, lon: number, start: string, end: string, hint?: 'home' | 'work'): Visit =>
  hint ? { lat, lon, start: at(start), end: at(end), hint } : { lat, lon, start: at(start), end: at(end) };

/** a visit to the office on a given date */
const office = (date: string, from = '09:49', to = '19:05') =>
  visit(OFFICE.lat, OFFICE.lon, `${date}T${from}:00+05:30`, `${date}T${to}:00+05:30`);
```

Then the cases, in the same file:

```ts
describe('a visit inside a circle he named', () => {
  it('becomes an arrival and a departure', () => {
    const rows = matchVisits([office('2026-03-02')], [OFFICE, HOME]);
    expect(rows).toEqual([
      { place: 'Office', at: at('2026-03-02T09:49:00+05:30'), via: 'import-enter' },
      { place: 'Office', at: at('2026-03-02T19:05:00+05:30'), via: 'import-exit' },
    ]);
  });

  it('keeps a visit exactly on the radius, since the rule is inclusive', () => {
    // 0.12 km due north of the office: nameFor treats the boundary as inside, and two
    // different answers for the same coordinate is the bug this test exists to stop
    const onEdge = { ...OFFICE, lat: OFFICE.lat + 0.12 / 111.32 };
    const rows = matchVisits(
      [visit(onEdge.lat, onEdge.lon, '2026-03-02T09:49:00+05:30', '2026-03-02T19:05:00+05:30')],
      [OFFICE]
    );
    expect(rows).toHaveLength(2);
  });

  it('throws away a visit to somewhere he has never named', () => {
    // 227 of the 238 clusters in the export are unnamed. They become questions in
    // unnamedClusters, never sightings with a guessed label
    expect(matchVisits([visit(22.5, 88.0, '2026-03-02T09:00:00+05:30', '2026-03-02T10:00:00+05:30')], [OFFICE])).toEqual([]);
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
    const rows = matchVisits([office('2026-03-02')], [OFFICE]);
    expect(withoutNear(rows, [])).toHaveLength(2);
  });
});
```

And the two summaries:

```ts
describe('what he is shown before anything is written', () => {
  it('counts days, not visits, and gives the usual arrival', () => {
    // four visits across two days is two days of evidence. A count of visits would
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
    const visits = [office('2026-03-02'), office('2026-03-03'), visit(HOME.lat, HOME.lon, '2026-03-02T20:55:00+05:30', '2026-03-03T08:10:00+05:30')];
    expect(importSummary(visits, [OFFICE, HOME]).map((r) => r.place)).toEqual(['Office', 'Home']);
  });

  it('says nothing about a place with no visits in the file', () => {
    expect(importSummary([office('2026-03-02')], [OFFICE, HOME]).map((r) => r.place)).toEqual(['Office']);
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
  /** 300 visits to one coordinate, one a day, at about eight in the evening */
  const many = (lat: number, lon: number, n: number, hint?: 'home' | 'work') =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(at('2025-03-08T20:00:00+05:30') + i * 24 * 60 * 60 * 1000);
      return visit(lat, lon, d.toISOString(), new Date(d.getTime() + 3600_000).toISOString(), hint);
    });

  it('proposes an unnamed cluster with its count, its days and its usual hour', () => {
    const c = unnamedClusters(many(22.9, 88.4, 40), [OFFICE, HOME]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ visits: 40, days: 40 });
    expect(c[0].hour).toBe(20 * 60);
  });

  it('passes on Google's own guess when it has one, since that arrives free', () => {
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
```

Note the apostrophe in `"passes on Google's own guess"` — write the test name in double
quotes, or escape it. This exact line has broken a heredoc before.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/lib/__tests__/archive.test.ts`
Expected: FAIL, `Cannot find module '../archive'`.

- [ ] **Step 3: Write `src/lib/archive.ts`**

```ts
import { AT_PLACE_KM, distanceKm } from './knownPlaces';
import type { KnownPlace } from './knownPlaces';
import type { Seen } from './timeline';

/**
 * A Timeline export, turned into sightings or into questions.
 *
 * Pure by design. Everything difficult about the import is arithmetic over a list, and
 * a phone is a bad place to discover that one of the sums was wrong — so nothing here
 * reads a file, opens a database, or knows what time it is.
 */

/** one `visit` segment from the export, reduced to what a sighting needs */
export type Visit = {
  lat: number;
  lon: number;
  start: number;
  end: number;
  /** Google's own guess, when the file carried one. A hint on a question, never a label */
  hint?: 'home' | 'work';
};

/** how close two visits must be to be the same place, absent a name */
export const CLUSTER_KM = 0.1;

/**
 * How many visits make an unnamed cluster worth asking about.
 *
 * The export holds 238 distinct places. Asking about all of them is a list nobody
 * answers, and a list nobody answers is the same as no feature. Twenty visits is a
 * place somebody goes to, not a shop they walked past.
 */
export const PROPOSE_MIN_VISITS = 20;

const minuteOfDay = (at: number): number => {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes();
};

const dayKey = (at: number): string => {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : s[mid - 1];
};

/** the named place a visit happened at, or null — the same rule `nameFor` uses */
const placeFor = (v: Visit, places: KnownPlace[]): KnownPlace | null => {
  let best: KnownPlace | null = null;
  let bestKm = Infinity;
  for (const p of places) {
    const km = distanceKm(v, p);
    if (km <= AT_PLACE_KM && km < bestKm) {
      best = p;
      bestKm = km;
    }
  }
  return best;
};

/**
 * Every visit that landed somewhere he has named, as an arrival and a departure.
 *
 * A visit to a cluster he has never named is discarded here and proposed by
 * `unnamedClusters` instead. **The importer never invents a name** — that rule is
 * older than this feature and is the reason `nameFor` exists at all.
 */
export function matchVisits(visits: Visit[], places: KnownPlace[]): Seen[] {
  const out: Seen[] = [];
  for (const v of visits) {
    const p = placeFor(v, places);
    if (!p) continue;
    out.push({ place: p.label, at: v.start, via: 'import-enter' });
    out.push({ place: p.label, at: v.end, via: 'import-exit' });
  }
  return out.sort((a, b) => a.at - b.at);
}
```

The rest of the file:

```ts
/** five minutes: one arrival, however many sources noticed it */
export const NEAR_MS = 5 * 60_000;

/**
 * Drop imported rows that describe an event the store already holds.
 *
 * The geofence recorded Sealdah at 9:23 and the export says 9:21. That is one arrival.
 * Two rows for it would not move a median — the medians are per day — but it would
 * make the store twice the size it needs to be and the diagnostics twice as hard to
 * read, and a second import must be free rather than doubling.
 */
export function withoutNear(rows: Seen[], existing: Seen[], windowMs = NEAR_MS): Seen[] {
  return rows.filter(
    (r) => !existing.some((e) => e.place === r.place && Math.abs(e.at - r.at) <= windowMs)
  );
}

/**
 * What he is shown before a single row is written.
 *
 * **Days, not visits, is the number that matters** — four visits across two days is
 * two days of evidence, and a count of visits reads as more history than there is.
 * Both are shown, ranked by days, because the honest sentence needs both.
 */
export function importSummary(
  visits: Visit[],
  places: KnownPlace[]
): { place: string; visits: number; days: number; hour: number | null }[] {
  const per = new Map<string, { visits: number; days: Set<string>; arrivals: number[] }>();
  for (const v of visits) {
    const p = placeFor(v, places);
    if (!p) continue;
    const held = per.get(p.label) ?? { visits: 0, days: new Set<string>(), arrivals: [] };
    held.visits += 1;
    held.days.add(dayKey(v.start));
    held.arrivals.push(minuteOfDay(v.start));
    per.set(p.label, held);
  }
  return [...per.entries()]
    .map(([place, h]) => ({
      place,
      visits: h.visits,
      days: h.days.size,
      hour: h.arrivals.length ? median(h.arrivals) : null,
    }))
    .sort((a, b) => b.days - a.days || b.visits - a.visits);
}

export type Cluster = {
  lat: number;
  lon: number;
  visits: number;
  days: number;
  hour: number;
  hint?: 'home' | 'work';
};

/**
 * The places he has been to over and over and never had the app open at.
 *
 * This is the part of the feature that removes a real limit rather than adding a
 * number: until now the only way to name somewhere was to be standing in it with the
 * app open. He can now name a place he visited two hundred times last year.
 *
 * The naming is still his. Google's `INFERRED_HOME` and `INFERRED_WORK` arrive in the
 * file for nothing and are passed through as a `hint`, but a hint decorates a
 * question — it never becomes a label. The other 236 clusters would need the Places
 * Details API, a key, and his place ids sent to Google, which is a trade this app has
 * never made and does not start making for prettier text.
 */
export function unnamedClusters(visits: Visit[], places: KnownPlace[]): Cluster[] {
  const groups: { lat: number; lon: number; hits: Visit[] }[] = [];
  for (const v of visits) {
    if (placeFor(v, places)) continue;
    const g = groups.find((x) => distanceKm(x, v) <= CLUSTER_KM);
    if (g) g.hits.push(v);
    else groups.push({ lat: v.lat, lon: v.lon, hits: [v] });
  }
  return groups
    .filter((g) => g.hits.length >= PROPOSE_MIN_VISITS)
    .map((g) => ({
      lat: g.lat,
      lon: g.lon,
      visits: g.hits.length,
      days: new Set(g.hits.map((v) => dayKey(v.start))).size,
      hour: median(g.hits.map((v) => minuteOfDay(v.start))),
      hint: g.hits.find((v) => v.hint)?.hint,
    }))
    .sort((a, b) => b.visits - a.visits);
}

/** the span of the whole file, for the sentence that says what is about to happen */
export function visitRange(visits: Visit[]): { from: number; to: number } | null {
  if (!visits.length) return null;
  return {
    from: Math.min(...visits.map((v) => v.start)),
    to: Math.max(...visits.map((v) => v.end)),
  };
}
```

- [ ] **Step 4: Run the tests, then everything**

Run: `npx jest src/lib/__tests__/archive.test.ts` — expect 18 passing.
Run: `npx tsc --noEmit` and `npx jest` — green.

- [ ] **Step 5: Commit and publish Tasks 1 and 2 together**

```bash
git add src/lib/archive.ts src/lib/__tests__/archive.test.ts
git commit -m "feat(import): match visits to named places, and propose the rest"
npx expo-updates fingerprint:generate --platform android
npx eas update --channel production --platform android --environment production \
  --message "Imported sightings, matched and marked" --non-interactive
```

The fingerprint **must not have moved**. Nothing here is native and nothing here is
reachable from the UI yet — this is the arithmetic landing ahead of the build, the same
split the geofence work used on 09-01.

---

### Task 3: The Kotlin parser, and the build that carries it

**Files:**
- Create: `modules/timeline-import/expo-module.config.json`
- Create: `modules/timeline-import/android/build.gradle`
- Create: `modules/timeline-import/android/src/main/java/expo/modules/timelineimport/TimelineImportModule.kt`
- Create: `modules/timeline-import/index.ts`
- Modify: `package.json` — add `expo-document-picker`
- Modify: `android/app/src/main/res/values/strings.xml` — re-bake the fingerprint

**Interfaces:**
- Produces, from `modules/timeline-import`:
  - `parse(uri: string): Promise<{ segments: number; visits: Visit[] }>` — `Visit` as Task 2 defines it
  - `parseError(): string | null`
  - `available(): boolean`

**This is the task that costs a build.** A new directory under `modules/` moves the OTA
fingerprint on its own, and `expo-document-picker` moves it again through autolinking.
**Both must land in the same APK** — publishing between them strands the phone.

**Why Kotlin and not JavaScript.** `JSON.parse` on 47 MB takes a laptop a few seconds
and takes the phone down. `android.util.JsonReader` is a pull parser built for exactly
this, runs in constant memory, and means the 47 MB never crosses into JavaScript at
all: what comes back is four numbers per visit, about 4,000 of them. The rejected
alternative was a hand-rolled brace-matching scanner in JS over chunked reads — no
build required, and a parser written under time pressure against a format Google keeps
changing, which is how you get a silent wrong answer.

**No new permission.** The file arrives as a `content://` URI the user picked, so
`READ_EXTERNAL_STORAGE` is not needed and must not be added.

- [ ] **Step 1: Back up the keystore before anything**

```bash
cp android/app/debug.keystore "$HOME/jarvis-debug.keystore.bak"
keytool -list -v -keystore android/app/debug.keystore -storepass android | grep SHA256
```

Expect `fac61745dc09…`. If that cert is lost, this phone can never be updated again
without an uninstall, and an uninstall costs the journal's 52,000 usage moments and the
chat archive. **Do not run `prebuild --clean`** — it deletes this file.

- [ ] **Step 2: Scaffold the module, mirroring `call-log`**

`modules/timeline-import/expo-module.config.json`:

```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.timelineimport.TimelineImportModule"]
  }
}
```

`modules/timeline-import/android/build.gradle`:

```gradle
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}

group = 'expo.modules.timelineimport'
version = '0.1.0'

android {
  namespace "expo.modules.timelineimport"
  defaultConfig {
    versionCode 1
    versionName "0.1.0"
  }
  lintOptions {
    abortOnError false
  }
}
```

- [ ] **Step 3: Write the parser**

`TimelineImportModule.kt`. `JsonReader` is a pull parser: `beginObject`, `nextName`,
`skipValue`. **Every branch must end in `skipValue()` for a name it does not want**, or
the reader throws on the next token — that is the single mistake this file can make.

```kotlin
package expo.modules.timelineimport

import android.net.Uri
import android.util.JsonReader
import android.util.JsonToken
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.InputStreamReader

/**
 * A Google Timeline export, streamed.
 *
 * The file is 47 MB and `JSON.parse` on it takes the phone down, so it is walked here
 * with a pull parser in constant memory and **never crosses into JavaScript**. What
 * leaves this file is four numbers per visit — about 4,000 of them out of 11,570
 * segments.
 *
 * The file is read once through the `content://` URI the user picked and is never
 * copied. Same rule as the call log: the phone already holds it, and a second copy is
 * a second thing to secure.
 */
class TimelineImportModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TimelineImport")

    /**
     * Walk the export and return the visits.
     *
     * `segments` is returned alongside them on purpose: **an empty visit list and a
     * parser that gave up look identical from JavaScript**, and this project has
     * shipped that confusion five times. 11,570 segments and 0 visits is a shape
     * change in Google's format; 0 segments is a file this code could not read.
     */
    AsyncFunction("parse") { uri: String ->
      val ctx = appContext.reactContext ?: throw IllegalStateException("no context")
      var segments = 0
      val visits = mutableListOf<Map<String, Any?>>()

      ctx.contentResolver.openInputStream(Uri.parse(uri)).use { stream ->
        JsonReader(InputStreamReader(requireNotNull(stream), "UTF-8")).use { r ->
          r.beginObject()
          while (r.hasNext()) {
            if (r.nextName() == "semanticSegments") {
              r.beginArray()
              while (r.hasNext()) {
                segments += 1
                readSegment(r)?.let { visits.add(it) }
              }
              r.endArray()
            } else {
              r.skipValue()
            }
          }
          r.endObject()
        }
      }

      mapOf("segments" to segments, "visits" to visits)
    }
  }
```

The rest of the same class:

```kotlin
  /**
   * One segment, kept only if it is a visit with a place.
   *
   * A segment carries `startTime` and `endTime` at the top level and the place inside
   * `visit.topCandidate.placeLocation.latLng`, which arrives as the string
   * `"22.8151500°, 88.3719100°"`. Activities and paths are skipped: 4,406 and 3,163 of
   * them, describing movement between places rather than being at one, and nothing in
   * the app asks that question yet.
   */
  private fun readSegment(r: JsonReader): Map<String, Any?>? {
    var start = 0L
    var end = 0L
    var lat: Double? = null
    var lon: Double? = null
    var hint: String? = null

    r.beginObject()
    while (r.hasNext()) {
      when (r.nextName()) {
        "startTime" -> start = millis(r.nextString())
        "endTime" -> end = millis(r.nextString())
        "visit" -> {
          r.beginObject()
          while (r.hasNext()) {
            when (r.nextName()) {
              "topCandidate" -> {
                r.beginObject()
                while (r.hasNext()) {
                  when (r.nextName()) {
                    "placeLocation" -> {
                      r.beginObject()
                      while (r.hasNext()) {
                        if (r.nextName() == "latLng") {
                          val parts = r.nextString().split(",")
                          lat = parts.getOrNull(0)?.trim()?.trimEnd('\u00B0')?.toDoubleOrNull()
                          lon = parts.getOrNull(1)?.trim()?.trimEnd('\u00B0')?.toDoubleOrNull()
                        } else {
                          r.skipValue()
                        }
                      }
                      r.endObject()
                    }
                    "semanticType" -> hint = when (r.nextString()) {
                      "INFERRED_HOME" -> "home"
                      "INFERRED_WORK" -> "work"
                      else -> null
                    }
                    else -> r.skipValue()
                  }
                }
                r.endObject()
              }
              else -> r.skipValue()
            }
          }
          r.endObject()
        }
        else -> r.skipValue()
      }
    }
    r.endObject()

    // a visit with no place is not a sighting, and a visit with no times is not one either
    if (lat == null || lon == null || start == 0L || end == 0L) return null
    return mapOf(
      "lat" to lat,
      "lon" to lon,
      "start" to start.toDouble(),
      "end" to end.toDouble(),
      "hint" to hint
    )
  }

  /**
   * An ISO timestamp to millis, without a formatter.
   *
   * The export writes `2026-09-03T09:49:00.000+05:30`. `Instant.parse` rejects an
   * offset in that form on some Android versions, and `SimpleDateFormat` is not
   * thread-safe, so this uses `OffsetDateTime` which handles both the `Z` and the
   * offset shapes the file actually contains.
   */
  private fun millis(iso: String): Long =
    try {
      java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli()
    } catch (_: Exception) {
      0L
    }
}
```

`toDouble()` on the way out is deliberate: Expo's bridge carries `Double` cleanly and a
`Long` timestamp arrives mangled past 2^53 — not a problem for these values, and not a
thing to leave to chance either.

- [ ] **Step 4: The lazy wrapper**

`modules/timeline-import/index.ts`, the same shape as `modules/call-log/index.ts`:

```ts
import { requireNativeModule } from 'expo';

import type { Visit } from '../../src/lib/archive';

/**
 * The streaming parser, resolved on first use and never at import.
 *
 * The JavaScript ships over the air and the native half only arrives with an APK, so
 * for the hours between publishing and installing there is a build in the world whose
 * bundle mentions a module it does not have. Requiring it at module scope would crash
 * that app at launch — the whole app, over a feature that reads a file.
 */
type Native = {
  parse: (uri: string) => Promise<{ segments: number; visits: Visit[] }>;
};

let native: Native | null = null;
let looked = false;
let lastError: string | null = null;

const module_ = (): Native | null => {
  if (!looked) {
    looked = true;
    try {
      native = requireNativeModule<Native>('TimelineImport');
    } catch {
      native = null;
    }
  }
  return native;
};

/** whether this build has the native half at all */
export function available(): boolean {
  return module_() !== null;
}

/** why the last parse came back empty, when it did */
export function parseError(): string | null {
  return lastError;
}

/**
 * Read an export.
 *
 * `segments` comes back beside the visits because **an empty list and a parser that
 * threw look identical otherwise**, and that confusion is the most expensive habit
 * this project has.
 */
export async function parse(uri: string): Promise<{ segments: number; visits: Visit[] }> {
  const m = module_();
  if (!m) {
    lastError = 'The native parser is not in this build.';
    return { segments: 0, visits: [] };
  }
  try {
    lastError = null;
    return await m.parse(uri);
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    return { segments: 0, visits: [] };
  }
}
```

- [ ] **Step 5: Add the picker, then build**

```bash
npx expo install expo-document-picker
npx expo-updates fingerprint:generate --platform android
```

The fingerprint **will** have moved — that is expected here and only here. Write the new
hash into `android/app/src/main/res/values/strings.xml` as `expo_runtime_version`, then:

```bash
cd android && nohup ./gradlew assembleRelease > /tmp/gradle.log 2>&1 &
```

**Run it detached.** A release build takes longer than the 10-minute tool timeout and a
killed Gradle leaves a lock behind. Poll `tail -3 /tmp/gradle.log` for `BUILD
SUCCESSFUL`.

- [ ] **Step 6: Install without losing anything**

```bash
adb install -r --no-streaming android/app/build/outputs/apk/release/app-release.apk
```

`-r` keeps the data. If it fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, **stop** —
the APK was signed with the wrong key and installing it means an uninstall. Do not
uninstall; find the keystore.

- [ ] **Step 7: Commit**

```bash
git add modules/timeline-import package.json package-lock.json android/app/src/main/res/values/strings.xml
git commit -m "feat(import): a streaming Kotlin parser, so 47 MB never reaches JavaScript"
```

Record the new runtime hash in `RESUME.md` in the same commit. A runtime that moved and
was not written down has cost this project an afternoon twice.

---

### Task 4: Pick it, see it, agree to it, undo it

**Files:**
- Create: `src/lib/archiveImport.ts`
- Create: `src/screens/ImportScreen.tsx`
- Modify: `src/navigation/RootNavigator.tsx` — `<SettingsStack.Screen name="Import" component={ImportScreen} />` beside `Places` (~line 122)
- Modify: `src/screens/PlacesScreen.tsx` — an IMPORTED row with FORGET, under `crossings-held`
- Test: `src/lib/__tests__/archiveImport.test.ts`

**Interfaces:**
- Consumes: `parse` from `modules/timeline-import`; everything from `src/lib/archive.ts`; `loadKnown`; `SEEN_WINDOW`, `loadSeen`, `forgetImported` from `src/lib/timeline.ts`.
- Produces, from `src/lib/archiveImport.ts`:
  - `Preview = { segments: number; visits: number; range: { from: number; to: number } | null; places: ReturnType<typeof importSummary>; clusters: Cluster[]; error: string | null }`
  - `previewFile(uri: string): Promise<Preview>`
  - `importVisits(visits: Visit[]): Promise<number>` — rows written
  - `importedHeld(): Promise<{ rows: number; from: number | null; to: number | null }>`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/archiveImport.test.ts`, with the native module mocked — this is the
only place a mock is right, because the real one needs an APK:

```ts
jest.mock('../../../modules/timeline-import', () => ({
  parse: jest.fn(),
  parseError: () => null,
  available: () => true,
}));

import { parse } from '../../../modules/timeline-import';
import { importVisits, importedHeld, previewFile } from '../archiveImport';
import { openSeenStore } from '../seenStore';
import { loadSeen, useSeenStore } from '../timeline';
```

Five cases:

1. `previewFile` over one office visit reports `segments`, one place with its days, and
   writes **nothing** — `loadSeen()` is still empty afterwards. This is the case that
   matters: a preview that writes is not a preview.
2. `previewFile` over a file the parser could not read reports `segments: 0` and a
   non-null `error`, so *the file held nothing* and *the parser gave up* are two
   different sentences on screen.
3. `importVisits` writes two rows per matched visit and returns the count.
4. importing the same visits twice returns 0 the second time and leaves the store the
   same size — the table's `(at, place)` key makes this free.
5. `importedHeld` reports the row count and the range, and `{ rows: 0, from: null,
   to: null }` on an empty store.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/lib/__tests__/archiveImport.test.ts`
Expected: FAIL, `Cannot find module '../archiveImport'`.

- [ ] **Step 3: Write `src/lib/archiveImport.ts`**

```ts
import { parse, parseError } from '../../modules/timeline-import';
import { importSummary, matchVisits, unnamedClusters, visitRange, withoutNear } from './archive';
import type { Cluster, Visit } from './archive';
import { loadKnown } from './knownPlaces';
import { openSeenStore } from './seenStore';
import { SEEN_WINDOW, loadSeen } from './timeline';

/**
 * The import, end to end, and the only file that touches both the parser and the store.
 *
 * Thin on purpose: every decision it makes lives in `archive.ts`, which is pure and
 * tested exhaustively. What is left here is the order things happen in.
 */

export type Preview = {
  segments: number;
  visits: number;
  range: { from: number; to: number } | null;
  places: ReturnType<typeof importSummary>;
  clusters: Cluster[];
  error: string | null;
};

/**
 * Read a file and say what importing it would do. **Writes nothing.**
 *
 * `segments` is surfaced even though nothing on screen needs the number, because
 * 11,570 segments with 0 visits is Google changing the format and 0 segments is a file
 * this code could not read — and *the import found nothing* has to be able to say
 * which.
 */
export async function previewFile(uri: string): Promise<Preview> {
  const [{ segments, visits }, places] = await Promise.all([parse(uri), loadKnown()]);
  return {
    segments,
    visits: visits.length,
    range: visitRange(visits),
    places: importSummary(visits, places),
    clusters: unnamedClusters(visits, places),
    error: parseError(),
  };
}

/** write the matched visits, skipping anything the store already describes */
export async function importVisits(visits: Visit[]): Promise<number> {
  const places = await loadKnown();
  const rows = withoutNear(matchVisits(visits, places), await loadSeen());
  if (!rows.length) return 0;
  const store = await openSeenStore();
  await store.putMany(rows);
  return rows.length;
}

/** what is imported right now, for the row that says so and the FORGET beside it */
export async function importedHeld(): Promise<{
  rows: number;
  from: number | null;
  to: number | null;
}> {
  const seen = (await loadSeen()).filter((s) => s.via === 'import-enter' || s.via === 'import-exit');
  if (!seen.length) return { rows: 0, from: null, to: null };
  return { rows: seen.length, from: seen[0].at, to: seen[seen.length - 1].at };
}
```

`importedHeld` reads the window rather than the whole table, and `SEEN_WINDOW` is
20,000 — comfortably more than one import writes. If that ever stops being true it
wants its own `COUNT(*)` on the store rather than a bigger window.

- [ ] **Step 4: The screen**

`src/screens/ImportScreen.tsx`, following `MemoryScreen.tsx` for layout and the
candidate flow for shape. Four states, and each one says which it is:

```
  IMPORT YOUR TIMELINE
  Settings → Location → Location Services → Timeline → Export Timeline data
  writes a file to Downloads. Nothing leaves this phone.

  [ CHOOSE A FILE ]

  --- after choosing, before agreeing ---
  Timeline.json · 11,570 segments · 4,000 visits · 8 Mar 2025 to 3 Sep 2026

  WOULD BE ADDED
  Home    · 751 visits · 516 days · usually arrives 20:55
  Office  · 699 visits · 344 days · usually arrives 09:49

  [ IMPORT ]   [ CANCEL ]
```

Rules the screen must hold:

- **Every control is a plain `Pressable`, never `Touchable`.** The animated wrapper
  ignores `adb shell input tap`, which cost three taps and an afternoon on the FORGET
  button in MemoryScreen. Anything that has to be verified over adb is a `Pressable`.
- **`error` is shown verbatim when it is non-null**, above everything else. *The file
  held nothing* and *the parser gave up* must never look the same.
- **When `segments > 0` and `visits === 0`**, say so explicitly: *"11,570 segments and
  no visits — Google has changed the format."* That is a different bug from an empty
  file and the sentence is the only place it will ever be visible.
- **Nothing is written until IMPORT.** The preview holds the visits in React state; the
  file is not copied anywhere.
- Use `DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: false })`.
  `copyToCacheDirectory: false` matters: `true` copies 47 MB into the app's cache, which
  is exactly the second copy the spec forbids.

- [ ] **Step 5: The row on Places, with the undo beside it**

Under the `crossings-held` line in `src/screens/PlacesScreen.tsx`, `testID="crossings-imported"`:

> `4,000 sightings imported from your Timeline, 8 Mar 2025 to 3 Sep 2026.` [ FORGET ]
>
> or `Nothing imported.` with no button

`FORGET` calls `forgetImported()` and re-reads both rows. It is a plain `Pressable`, and
it does **not** confirm — the whole argument for offering an import at all is that
taking it back is free.

- [ ] **Step 6: Run everything, then publish**

```bash
npx tsc --noEmit
npx jest
npx expo-updates fingerprint:generate --platform android
```

The fingerprint must match the one baked in Task 3 — this task is JavaScript on top of
that build. Then publish, and check on the device: Settings → Places → the IMPORTED
row, then the import itself with the real 47 MB file.

**On the device, in this order:** the row reads *Nothing imported* first; the picker
opens; the preview names Home and Office with day counts in the hundreds; IMPORT; the
row now names a range starting in March 2025; FORGET; the row reads *Nothing imported*
again and `Crossings recorded` is **unchanged** — six real crossings, not eight
thousand. That last check is the one that proves Task 1 was right.

- [ ] **Step 7: Commit**

```bash
git add src/lib/archiveImport.ts src/screens/ImportScreen.tsx src/screens/PlacesScreen.tsx src/navigation/RootNavigator.tsx src/lib/__tests__/archiveImport.test.ts
git commit -m "feat(import): pick a Timeline export, see what it would add, agree to it"
```

---

### Task 5: He names the places he has been two hundred times

**Files:**
- Modify: `src/lib/knownPlaces.ts` — `KnownPlace.placeId?: string`, and `nameCluster`
- Modify: `src/screens/ImportScreen.tsx` — the UNNAMED PLACES section
- Test: `src/lib/__tests__/naming.test.ts` (create)

**Interfaces:**
- Consumes: `Cluster` from `src/lib/archive.ts`; `KnownPlace`, `KNOWN_CAP`, `loadKnown` from `src/lib/knownPlaces.ts`.
- Produces:
  - `KnownPlace.placeId?: string`
  - `nameCluster(label: string, c: { lat: number; lon: number }): Promise<KnownPlace[]>` from `src/lib/knownPlaces.ts`
  - `clusterHint(c: Cluster): string` from `src/lib/archive.ts` — the sentence for one proposal

**Why this task exists, and it is not a nicety.** Until now the only way to name a place
was to be standing in it with the app open — `nameHere(id, label, fix)` takes a live
fix. That is the real limit this whole feature removes: he can name somewhere he
visited two hundred times last year and never had the app open at. Without this task
the import can only ever fill in history for the eleven places he happens to have
stood in.

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/naming.test.ts`, four cases:

1. `clusterHint({ visits: 743, days: 516, hour: 1255, hint: 'home' })` reads
   `"Looks like your home · 743 visits · 516 days · usually 20:55"`
2. the same without a hint drops the first clause entirely — no *"Looks like
   somewhere"*, which says nothing and takes a line to do it
3. `nameCluster('Kitty\'s place', { lat: 22.9, lon: 88.4 })` adds a `KnownPlace` with
   that label and those coordinates, and `loadKnown()` returns it
4. `nameCluster` at `KNOWN_CAP` places rejects rather than silently dropping the oldest
   — twelve is the cap and a place that vanished when a thirteenth was named would be
   indistinguishable from a bug

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/lib/__tests__/naming.test.ts`
Expected: FAIL, `nameCluster` and `clusterHint` are not exported.

- [ ] **Step 3: Implement both**

In `src/lib/archive.ts`:

```ts
/**
 * The sentence for one unnamed cluster.
 *
 * Google's guess leads when there is one, because *"looks like your home"* is worth
 * more than any coordinate — and the clause is **omitted entirely** when there is no
 * guess rather than replaced with something vague. A line that says nothing still
 * costs a line.
 */
export function clusterHint(c: Cluster): string {
  const clock = `${String(Math.floor(c.hour / 60)).padStart(2, '0')}:${String(c.hour % 60).padStart(2, '0')}`;
  const lead = c.hint === 'home' ? 'Looks like your home · ' : c.hint === 'work' ? 'Looks like your work · ' : '';
  return `${lead}${c.visits} visits · ${c.days} days · usually ${clock}`;
}
```

In `src/lib/knownPlaces.ts`, add `placeId?: string` to `KnownPlace` — the export carries
a stable `placeId` per visit, so a named place linked to one stops depending on a 120 m
radius and starts matching exactly. Nothing reads it yet; storing it now costs a line
and saves a migration.

Then `nameCluster`, which is `nameHere` without the live fix:

```ts
/**
 * Name a place from coordinates rather than from where the phone is standing.
 *
 * `nameHere` needs a fix, which meant a place could only be named while you were in
 * it. This is the same write with the coordinates supplied — which is what makes an
 * import worth anything beyond the handful of places he has stood in with the app
 * open.
 */
export async function nameCluster(
  label: string,
  at: { lat: number; lon: number; placeId?: string }
): Promise<KnownPlace[]> {
  const places = await loadKnown();
  if (places.length >= KNOWN_CAP) return places;
  const id = `c${Date.now().toString(36)}`;
  const next = [...places, { id, label, lat: at.lat, lon: at.lon, area: '', placeId: at.placeId }];
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
```

`area` is empty rather than reverse-geocoded: that lookup needs a network call and the
label came from a person, which is the better source anyway.

- [ ] **Step 4: The section on the screen**

Under the preview in `ImportScreen.tsx`:

```
  UNNAMED PLACES HE HAS SEEN
  Looks like your home · 743 visits · 516 days · usually 20:55   [ NAME ]
  261 visits · 211 days · usually 19:20                          [ NAME ]
```

NAME opens a `TextInput` inline, and saving calls `nameCluster` and then **re-runs the
match on the visits already in state**, so the newly named place appears in WOULD BE
ADDED immediately with its full history. Nothing is re-parsed; the visits never left
memory.

- [ ] **Step 5: Run everything and commit**

```bash
npx tsc --noEmit && npx jest
git add src/lib/knownPlaces.ts src/lib/archive.ts src/screens/ImportScreen.tsx src/lib/__tests__/naming.test.ts
git commit -m "feat(import): name a place you have visited two hundred times and never opened the app at"
```

Publish, then on the device: import the real file, name one cluster the preview
proposes, and watch WOULD BE ADDED grow a row with hundreds of days behind it.

---

## Self-review

**Spec coverage.** Section 1 (streaming Kotlin) is Task 3. Section 2 (the SQLite store)
was Plan A and is proved on the device. Section 3 (`via: 'import'`) is Task 1 — with one
deliberate departure: **two values rather than one**, because a single `'import'` cannot
tell an imported arrival from an imported departure, which is the distinction every
figure in `timeline.ts` is built on. The end-to-end list is Tasks 2 and 4; the naming
section is Task 5. *What it deliberately does not do* is respected throughout: the file
is never copied (`copyToCacheDirectory: false`), nothing is uploaded, no place is
invented, activities and paths are skipped.

**Placeholders.** None. Every code step carries the code. The three steps that describe
a screen instead of writing it — Task 4 Steps 4 and 5, Task 5 Step 4 — name the exact
`testID`s, the exact sentences, the picker options and the component rules, because
screen logic in this repo is untestable (the navigation mock trips *"Invalid hook
call"*) and a plan that pretends otherwise produces tests that are deleted.

**Type consistency.** `Visit` is defined once in `src/lib/archive.ts` and imported by
the native wrapper and the orchestrator. `Cluster` likewise. `Source` is used by both
`leftBy` and `arrivalHour`. `putMany` and `dropImported` are named identically in
Tasks 1 and 4. `isCrossing` is used in exactly the three places Task 1 enumerates.

**Three risks worth naming before starting.**

1. **Task 3 is a runtime move and cannot be split.** A new `modules/` directory and
   `expo-document-picker` both change the fingerprint, and publishing between them
   strands the phone. They land in one APK, or not at all.
2. **The parser is written against one real file.** Google changes this format. That is
   why `segments` comes back alongside the visits and why the screen has a sentence for
   *11,570 segments and no visits* — the shape change is survivable if it is legible,
   and silent if it is not.
3. **The device check in Task 4 Step 6 is the one that matters.** After FORGET, the
   `Crossings recorded` row must still show six crossings rather than eight thousand.
   That single observation is what proves the three `isCrossing` narrowings in Task 1
   were correct, and no test in this plan can prove it in the way that reading the row
   does.

## What this unblocks

`anticipate-habit`, immediately and without waiting for days to pass: `usuallyHereBy`,
`leftBy`, `arrivalHour` and `nextSeenElsewhere` all rest on `ENOUGH_PLACE_DAYS = 4`,
and the export carries 344 days at the office and 516 at home. The figure the app quotes
today — *"usually you are there by 11:51 AM"*, from four app-opens by a man at his desk
since ten — becomes **09:49 across 344 days** on the day this lands.
