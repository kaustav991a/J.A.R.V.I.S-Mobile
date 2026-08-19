# Phone Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect Android usage statistics into a local SQLite journal on the phone, and show what has been collected — the foundation every later "J.A.R.V.I.S. knows him" feature reads from.

**Architecture:** Three layers with hard boundaries. A local Expo module (Kotlin) translates one Android API and knows nothing about JARVIS. A store module owns expo-sqlite — schema, retention, every query — and nothing above it writes SQL. A screen reads the store and says what is there. Raw events never leave the device.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, `expo-sqlite` (async API), a local Expo module in Kotlin, jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-08-19-phone-journal-design.md`

## Global Constraints

- **Expo SDK 57.** Read `https://docs.expo.dev/versions/v57.0.0/` before using any Expo API. Never answer an Expo question from memory — `AGENTS.md` is explicit, and guessing here has already cost this project real time.
- **Adding an npm package means restarting Metro with `npx expo start -c`.** A reload does not clear the module map, and the failure looks exactly like a missing package sitting right there on disk.
- **A new native module means `npx expo prebuild --clean` and a fresh dev build.** `android/` exists locally. Native config that looks applied and is not is this project's most expensive recurring bug.
- **`await act(async () => …)` always.** A bare synchronous `act()` does not flush in RNTL 14 — the callback runs and the assertion after it still reads the previous state. This looks exactly like a broken implementation.
- **Both must pass before claiming anything works:** `npm test` and `npm run typecheck`.
- **Four outcomes, never one.** Every read reports `granted`-with-rows, `granted`-empty, `denied` or `error` distinguishably. A silent result has twice been read in this project as "nothing happened" when it meant "nothing was measured".
- **Comments explain *why*,** especially where the obvious approach was tried and failed. Match the surrounding density.
- **Tests are named as sentences describing the behaviour**, and the interesting ones carry a comment saying which bug they exist to prevent.
- Android retention, verified 2026-08-19: **daily 7 days, weekly 4 weeks, monthly 6 months, yearly 2 years.**

---

### Task 1: Prove the local-module toolchain before building anything real

The riskiest thing in this plan is not the code, it is whether a local Expo module builds and loads in this app at all. Find out with a module that does nothing.

**Files:**
- Create: `modules/usage-stats/` (generated)
- Modify: `package.json` (adds `expo-sqlite`, used from Task 2 on)

**Interfaces:**
- Consumes: nothing
- Produces: a `modules/usage-stats` local module that imports and returns a string from Kotlin

- [ ] **Step 1: Scaffold the local module**

```bash
npx create-expo-module@latest --local
```

Answer the prompts with name `usage-stats`. This creates `modules/usage-stats/` containing `android/`, `ios/`, `src/`, `expo-module.config.json` and `index.ts`.

- [ ] **Step 2: Add expo-sqlite now, so there is one Metro restart rather than two**

```bash
npx expo install expo-sqlite
```

- [ ] **Step 3: Reduce the generated Kotlin to one function**

Replace `modules/usage-stats/android/src/main/java/expo/modules/usagestats/UsageStatsModule.kt` with:

```kotlin
package expo.modules.usagestats

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UsageStatsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UsageStats")

    // the toolchain proof, and it stays for the life of the module: when the
    // native side is not loaded at all, every other call throws with a message
    // about a missing module, and this one call says so in a sentence
    Function("ping") {
      "usage-stats native alive"
    }
  }
}
```

- [ ] **Step 4: Reduce the generated TS surface to match**

Replace `modules/usage-stats/index.ts` with:

```ts
import { requireNativeModule } from 'expo';

/**
 * The Android usage-stats API, and nothing else.
 *
 * Deliberately knows nothing about JARVIS: it is a translation of one platform
 * API, so it can be swapped for a fake in every test above it.
 */
const native = requireNativeModule('UsageStats');

export function ping(): string {
  return native.ping();
}
```

- [ ] **Step 5: Rebuild the native app**

```bash
npx expo prebuild --clean
npx expo run:android
```

Expected: the app builds and launches on the device. A failure here is a toolchain failure and must be solved before any other task starts.

- [ ] **Step 6: Prove the native side is reachable**

Temporarily add to `App.tsx`, inside the component body:

```tsx
import { ping } from './modules/usage-stats';
// …
console.log('[journal]', ping());
```

Run `npx expo start -c`, then read the log:

```bash
adb logcat -s ReactNativeJS:V | grep journal
```

Expected: `[journal] usage-stats native alive`. Remove the temporary lines once seen.

- [ ] **Step 7: Commit**

```bash
git add modules package.json package-lock.json android ios
git commit -m "feat(journal): a local usage-stats module, proved alive on the device"
```

---

### Task 2: The store — schema, idempotent writes, retention

**Files:**
- Create: `src/lib/journal/store.ts`
- Test: `src/lib/journal/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `expo-sqlite` (`openDatabaseAsync`, `execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`)
- Produces:
  - `type UsageEvent = { at: number; kind: EventKind; app: string | null }`
  - `type EventKind = 'foreground' | 'background' | 'screen_on' | 'screen_off' | 'unlock'`
  - `type DailyRow = { day: string; app: string; ms: number }`
  - `openJournal(name?: string): Promise<Journal>`
  - `Journal` with `putEvents(rows: UsageEvent[]): Promise<number>`, `putDaily(rows: DailyRow[]): Promise<number>`, `eventsBetween(from: number, to: number): Promise<UsageEvent[]>`, `dailyFor(day: string): Promise<DailyRow[]>`, `watermark(source: string): Promise<number | null>`, `setWatermark(source: string, through: number): Promise<void>`, `prune(now: number): Promise<number>`, `size(): Promise<{ events: number; daily: number }>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/journal/__tests__/store.test.ts`:

```ts
import { openJournal, RETENTION_MS } from '../store';
import type { Journal } from '../store';

// ':memory:' is supported by expo-sqlite's async API and gives every test a
// clean database with no file to clean up
const fresh = async (): Promise<Journal> => await openJournal(':memory:');

describe('the journal store', () => {
  it('keeps an event it has been given', async () => {
    const j = await fresh();
    await j.putEvents([{ at: 1000, kind: 'foreground', app: 'com.whatsapp' }]);
    expect(await j.eventsBetween(0, 2000)).toEqual([
      { at: 1000, kind: 'foreground', app: 'com.whatsapp' },
    ]);
  });

  /**
   * Collection windows overlap on purpose — a sync asks for a little before its
   * watermark so a boundary event is never missed. That is only safe if writing
   * the same event twice is a no-op.
   */
  it('writes the same event twice without duplicating it', async () => {
    const j = await fresh();
    const row = { at: 1000, kind: 'foreground' as const, app: 'com.whatsapp' };
    await j.putEvents([row]);
    const written = await j.putEvents([row]);
    expect(written).toBe(0);
    expect(await j.eventsBetween(0, 2000)).toHaveLength(1);
  });

  it('tells two apps apart at the same instant', async () => {
    // one leaves as the other arrives, and both carry the same timestamp
    const j = await fresh();
    await j.putEvents([
      { at: 1000, kind: 'background', app: 'com.whatsapp' },
      { at: 1000, kind: 'foreground', app: 'com.instagram.android' },
    ]);
    expect(await j.eventsBetween(0, 2000)).toHaveLength(2);
  });

  it('takes the newest figure for a day that is read again', async () => {
    // a day still in progress is re-read on the next sync and its total grows
    const j = await fresh();
    await j.putDaily([{ day: '2026-08-19', app: 'com.whatsapp', ms: 60_000 }]);
    await j.putDaily([{ day: '2026-08-19', app: 'com.whatsapp', ms: 95_000 }]);
    expect(await j.dailyFor('2026-08-19')).toEqual([
      { day: '2026-08-19', app: 'com.whatsapp', ms: 95_000 },
    ]);
  });

  it('remembers how far a source has been pulled', async () => {
    const j = await fresh();
    expect(await j.watermark('events')).toBeNull();
    await j.setWatermark('events', 4321);
    expect(await j.watermark('events')).toBe(4321);
  });

  it('drops events older than the retention window and keeps the rest', async () => {
    const now = 1_800_000_000_000;
    const j = await fresh();
    await j.putEvents([
      { at: now - RETENTION_MS - 1, kind: 'foreground', app: 'old.app' },
      { at: now - 1000, kind: 'foreground', app: 'new.app' },
    ]);
    expect(await j.prune(now)).toBe(1);
    const left = await j.eventsBetween(0, now);
    expect(left.map((e) => e.app)).toEqual(['new.app']);
  });

  it('reports what it is holding, so the screen can say so', async () => {
    const j = await fresh();
    await j.putEvents([{ at: 1000, kind: 'unlock', app: null }]);
    await j.putDaily([{ day: '2026-08-19', app: 'com.whatsapp', ms: 10 }]);
    expect(await j.size()).toEqual({ events: 1, daily: 1 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/journal/__tests__/store.test.ts`
Expected: FAIL — `Cannot find module '../store'`.

- [ ] **Step 3: Write the store**

Create `src/lib/journal/store.ts`:

```ts
import * as SQLite from 'expo-sqlite';

/**
 * The local journal: what this phone has observed about its own use.
 *
 * Every SQL statement in the app lives in this file. Nothing above it writes a
 * query, so the schema can change without a search across screens — and the
 * pieces that will read this later (recall, patterns, anticipation) all sit on
 * this one surface.
 */

export type EventKind = 'foreground' | 'background' | 'screen_on' | 'screen_off' | 'unlock';

/** a precise moment. Android keeps roughly seven days of these */
export type UsageEvent = { at: number; kind: EventKind; app: string | null };

/** a coarse per-day total. Android keeps these for up to two years */
export type DailyRow = { day: string; app: string; ms: number };

/**
 * Two years, matching the longest window Android will serve.
 *
 * Bounded rather than tight: an event row is tens of bytes and a heavy day is a
 * few hundred rows, so a year is comfortably under 10 MB. The cap exists so the
 * file cannot grow without limit on a phone that is never reinstalled.
 */
export const RETENTION_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS events (
  at   INTEGER NOT NULL,
  kind TEXT    NOT NULL,
  app  TEXT,
  PRIMARY KEY (at, kind, app)
);
CREATE INDEX IF NOT EXISTS events_at ON events (at);
CREATE TABLE IF NOT EXISTS daily (
  day TEXT    NOT NULL,
  app TEXT    NOT NULL,
  ms  INTEGER NOT NULL,
  PRIMARY KEY (day, app)
);
CREATE TABLE IF NOT EXISTS sync (source TEXT PRIMARY KEY, through INTEGER NOT NULL);
`;

export type Journal = {
  putEvents(rows: UsageEvent[]): Promise<number>;
  putDaily(rows: DailyRow[]): Promise<number>;
  eventsBetween(from: number, to: number): Promise<UsageEvent[]>;
  dailyFor(day: string): Promise<DailyRow[]>;
  watermark(source: string): Promise<number | null>;
  setWatermark(source: string, through: number): Promise<void>;
  prune(now: number): Promise<number>;
  size(): Promise<{ events: number; daily: number }>;
};

export async function openJournal(name = 'jarvis-journal.db'): Promise<Journal> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync(SCHEMA);

  return {
    /**
     * Returns how many rows were genuinely new.
     *
     * `INSERT OR IGNORE` against the composite key, because collection windows
     * overlap deliberately: a sync asks for slightly before its watermark so an
     * event on the boundary is never missed, and that is only safe when writing
     * the same event twice costs nothing.
     */
    async putEvents(rows) {
      let written = 0;
      for (const r of rows) {
        const res = await db.runAsync(
          'INSERT OR IGNORE INTO events (at, kind, app) VALUES (?, ?, ?)',
          r.at,
          r.kind,
          r.app
        );
        written += res.changes;
      }
      return written;
    },

    /**
     * The newest read of a day wins.
     *
     * A day still in progress is re-read on every sync and its total only grows,
     * so replacing is right and summing would double-count.
     */
    async putDaily(rows) {
      let written = 0;
      for (const r of rows) {
        const res = await db.runAsync(
          `INSERT INTO daily (day, app, ms) VALUES (?, ?, ?)
           ON CONFLICT (day, app) DO UPDATE SET ms = excluded.ms`,
          r.day,
          r.app,
          r.ms
        );
        written += res.changes;
      }
      return written;
    },

    async eventsBetween(from, to) {
      return (await db.getAllAsync(
        'SELECT at, kind, app FROM events WHERE at >= ? AND at <= ? ORDER BY at ASC',
        from,
        to
      )) as UsageEvent[];
    },

    async dailyFor(day) {
      return (await db.getAllAsync(
        'SELECT day, app, ms FROM daily WHERE day = ? ORDER BY ms DESC',
        day
      )) as DailyRow[];
    },

    async watermark(source) {
      const row = (await db.getFirstAsync('SELECT through FROM sync WHERE source = ?', source)) as
        | { through: number }
        | null;
      return row ? row.through : null;
    },

    async setWatermark(source, through) {
      await db.runAsync(
        `INSERT INTO sync (source, through) VALUES (?, ?)
         ON CONFLICT (source) DO UPDATE SET through = excluded.through`,
        source,
        through
      );
    },

    async prune(now) {
      const res = await db.runAsync('DELETE FROM events WHERE at < ?', now - RETENTION_MS);
      return res.changes;
    },

    async size() {
      const e = (await db.getFirstAsync('SELECT COUNT(*) AS n FROM events')) as { n: number };
      const d = (await db.getFirstAsync('SELECT COUNT(*) AS n FROM daily')) as { n: number };
      return { events: e.n, daily: d.n };
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/journal/__tests__/store.test.ts`
Expected: PASS, 7 tests.

If `expo-sqlite` cannot open a database under jest-expo, do **not** mock the store away — mock `expo-sqlite` with a thin in-memory driver in `jest-setup.js` instead. The value of these tests is that the real SQL runs.

- [ ] **Step 5: Commit**

```bash
git add src/lib/journal
git commit -m "feat(journal): the local store, and writing the same window twice is free"
```

---

### Task 3: The digest — what a day looked like, in words

Pure functions over rows. No native, no database, no async. These are the cheapest tests in the feature and they are the ones that decide whether the output reads like J.A.R.V.I.S. or like a spreadsheet.

**Files:**
- Create: `src/lib/journal/digest.ts`
- Test: `src/lib/journal/__tests__/digest.test.ts`

**Interfaces:**
- Consumes: `DailyRow`, `UsageEvent` from `src/lib/journal/store.ts`
- Produces:
  - `type Reading = { state: 'measured'; total: number; top: DailyRow[]; pickups: number } | { state: 'empty' } | { state: 'denied' } | { state: 'error'; problem: string }`
  - `summarise(rows: DailyRow[], events: UsageEvent[]): Reading`
  - `describe(reading: Reading): string`
  - `appLabel(pkg: string): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/journal/__tests__/digest.test.ts`:

```ts
import { appLabel, describe as say, summarise } from '../digest';
import type { DailyRow, UsageEvent } from '../store';

const daily = (app: string, ms: number): DailyRow => ({ day: '2026-08-19', app, ms });
const unlock = (at: number): UsageEvent => ({ at, kind: 'unlock', app: null });

describe('summarising a day', () => {
  it('adds the time up and ranks the apps', () => {
    const r = summarise([daily('com.whatsapp', 60_000), daily('com.instagram.android', 120_000)], []);
    if (r.state !== 'measured') throw new Error('narrowing');
    expect(r.total).toBe(180_000);
    expect(r.top[0].app).toBe('com.instagram.android');
  });

  it('counts pickups from unlocks, not from app launches', () => {
    // an app coming to the foreground while you are already looking at the phone
    // is not a pickup, and counting it that way inflates the figure severalfold
    const r = summarise([daily('com.whatsapp', 10)], [unlock(1), unlock(2), { at: 3, kind: 'foreground', app: 'x' }]);
    if (r.state !== 'measured') throw new Error('narrowing');
    expect(r.pickups).toBe(2);
  });

  it('calls a day with no rows empty, which is not the same as unmeasured', () => {
    expect(summarise([], []).state).toBe('empty');
  });
});

describe('putting a reading into words', () => {
  it('names the figure and the app', () => {
    const line = say(summarise([daily('com.instagram.android', 3_600_000)], [unlock(1)]));
    expect(line).toContain('1h');
    expect(line).toContain('Instagram');
  });

  /**
   * The bug this exists to prevent, and this project has shipped it twice: a
   * silent result read as "nothing happened" when it meant "nothing was
   * measured". Permission can be revoked from Settings at any moment, and the
   * next read then returns nothing at all.
   */
  it('says it cannot see, rather than claiming you used nothing', () => {
    const line = say({ state: 'denied' });
    expect(line).toContain('cannot see');
    expect(line).not.toContain('nothing');
  });

  it('says an empty day is empty', () => {
    expect(say({ state: 'empty' })).toContain('Nothing recorded');
  });

  it('names what failed rather than going quiet', () => {
    expect(say({ state: 'error', problem: 'SQLITE_BUSY' })).toContain('SQLITE_BUSY');
  });
});

describe('naming an app', () => {
  it('uses the last meaningful part of the package name', () => {
    expect(appLabel('com.instagram.android')).toBe('Instagram');
    expect(appLabel('com.whatsapp')).toBe('Whatsapp');
  });

  it('gives back anything it cannot parse unchanged', () => {
    expect(appLabel('weirdthing')).toBe('Weirdthing');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/journal/__tests__/digest.test.ts`
Expected: FAIL — `Cannot find module '../digest'`.

- [ ] **Step 3: Write the digest**

Create `src/lib/journal/digest.ts`:

```ts
import type { DailyRow, UsageEvent } from './store';

/**
 * What a day looked like, and how to say it out loud.
 *
 * Pure functions over rows: no database, no native, no clock. Everything that
 * decides how this *reads* is testable for free, which matters because the
 * wording is the part a person actually meets.
 */

export type Reading =
  | { state: 'measured'; total: number; top: DailyRow[]; pickups: number }
  /** measured, and there was genuinely nothing */
  | { state: 'empty' }
  /** not measured: the permission is absent or was revoked */
  | { state: 'denied' }
  | { state: 'error'; problem: string };

/** how many apps a digest names before it stops being a digest */
const TOP_N = 3;

export function summarise(rows: DailyRow[], events: UsageEvent[]): Reading {
  if (rows.length === 0) return { state: 'empty' };
  const top = [...rows].sort((a, b) => b.ms - a.ms).slice(0, TOP_N);
  return {
    state: 'measured',
    total: rows.reduce((sum, r) => sum + r.ms, 0),
    top,
    // Unlocks, not foreground events. An app coming to the front while the phone
    // is already in your hand is not a pickup, and counting those inflates the
    // number severalfold — which would make every later "you check your phone N
    // times a day" observation wrong in the direction that sounds impressive.
    pickups: events.filter((e) => e.kind === 'unlock').length,
  };
}

const duration = (ms: number): string => {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

/**
 * Package name to something a person recognises.
 *
 * The real label lives in `PackageManager` and would need another native call
 * for a cosmetic gain; the last meaningful segment is right almost always and
 * wrong harmlessly. `com.instagram.android` ends in a platform word, so a final
 * `android` is skipped.
 */
export function appLabel(pkg: string): string {
  const parts = pkg.split('.').filter((p) => p && p !== 'android');
  const last = parts[parts.length - 1] ?? pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export function describe(reading: Reading): string {
  switch (reading.state) {
    case 'denied':
      // Never "you used nothing". Silence here means the permission is gone, and
      // reading that as abstinence is the bug this project has already paid for
      // twice — the mute briefing, and the Vitals panel empty against a healthy
      // machine.
      return 'I cannot see your usage, sir — the permission is off.';
    case 'error':
      return `I could not read the journal, sir (${reading.problem}).`;
    case 'empty':
      return 'Nothing recorded for that day, sir.';
    case 'measured': {
      const named = reading.top.map((t) => `${appLabel(t.app)} ${duration(t.ms)}`).join(', ');
      return `${duration(reading.total)} on the phone, sir, across ${reading.pickups} pickups. ${named}.`;
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/journal/__tests__/digest.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/journal
git commit -m "feat(journal): a day in words, and it never calls a revoked permission abstinence"
```

---

### Task 4: The native source, and a fake that stands in for it

**Files:**
- Modify: `modules/usage-stats/android/src/main/java/expo/modules/usagestats/UsageStatsModule.kt`
- Modify: `modules/usage-stats/index.ts`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `src/lib/journal/source.ts`
- Test: `src/lib/journal/__tests__/source.test.ts`

**Interfaces:**
- Consumes: `modules/usage-stats`
- Produces:
  - `type Grant = 'granted' | 'denied' | 'unavailable'`
  - `interface UsageSource { permission(): Promise<Grant>; openSettings(): Promise<void>; queryDaily(from: number, to: number): Promise<DailyRow[]>; queryEvents(from: number, to: number): Promise<UsageEvent[]> }`
  - `androidSource: UsageSource`
  - `fakeSource(seed?: Partial<{ grant: Grant; daily: DailyRow[]; events: UsageEvent[]; throws: string }>): UsageSource`

- [ ] **Step 1: Declare the permission**

In `android/app/src/main/AndroidManifest.xml`, inside `<manifest>` and before `<application>`, add:

```xml
<!--
  A signature|privileged permission the user grants by hand in Settings, not by a
  runtime prompt. `tools:ignore` is required or the manifest merger fails the
  build outright — it is not a warning being silenced, it is the only way to
  declare this permission in an ordinary app.
-->
<uses-permission
    android:name="android.permission.PACKAGE_USAGE_STATS"
    tools:ignore="ProtectedPermissions" />
```

Ensure the `<manifest>` tag carries `xmlns:tools="http://schemas.android.com/tools"`.

- [ ] **Step 2: Write the Kotlin**

Replace `UsageStatsModule.kt`:

```kotlin
package expo.modules.usagestats

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * A translation of Android's usage-stats API, and nothing more.
 *
 * Knows nothing about JARVIS, the journal or the app: everything above it talks
 * to the `UsageSource` interface, so the whole feature is testable without a
 * device.
 */
class UsageStatsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UsageStats")

    Function("ping") { "usage-stats native alive" }

    /**
     * There is no `checkSelfPermission` answer for this one.
     *
     * PACKAGE_USAGE_STATS is an app-op, granted by hand in Settings, so the only
     * truthful check is AppOps. It can also be revoked at any moment without the
     * app being told, which is why everything above re-asks rather than caching.
     */
    Function("permission") {
      val ctx = appContext.reactContext ?: return@Function "unavailable"
      val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
        ?: return@Function "unavailable"
      val mode = ops.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        ctx.packageName
      )
      if (mode == AppOpsManager.MODE_ALLOWED) "granted" else "denied"
    }

    Function("openSettings") {
      val ctx = appContext.reactContext ?: return@Function false
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
      // no activity to start from when the app is not foregrounded, and the flag
      // is what lets the application context raise it anyway
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
      true
    }

    AsyncFunction("queryDaily") { from: Long, to: Long ->
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        ?: return@AsyncFunction emptyList<Map<String, Any>>()
      // INTERVAL_DAILY, and the buckets are what Android keeps for up to two
      // years — the reason a first launch is not a blank slate.
      //
      // No launch count: `mLaunchCount` is hidden API with no public getter, and
      // reaching it by reflection works on one phone and returns zero on the
      // next. Launches are counted from ACTIVITY_RESUMED events instead.
      usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, from, to)
        .filter { it.totalTimeInForeground > 0 }
        .map {
          mapOf(
            "app" to it.packageName,
            "ms" to it.totalTimeInForeground,
            "end" to it.lastTimeStamp
          )
        }
    }

    AsyncFunction("queryEvents") { from: Long, to: Long ->
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      val out = mutableListOf<Map<String, Any?>>()
      val cursor = usm.queryEvents(from, to)
      val event = UsageEvents.Event()
      while (cursor.hasNextEvent()) {
        cursor.getNextEvent(event)
        val kind = when (event.eventType) {
          UsageEvents.Event.ACTIVITY_RESUMED -> "foreground"
          UsageEvents.Event.ACTIVITY_PAUSED -> "background"
          UsageEvents.Event.SCREEN_INTERACTIVE -> "screen_on"
          UsageEvents.Event.SCREEN_NON_INTERACTIVE -> "screen_off"
          UsageEvents.Event.KEYGUARD_HIDDEN -> "unlock"
          else -> null
        } ?: continue
        out.add(
          mapOf(
            "at" to event.timeStamp,
            "kind" to kind,
            // screen and keyguard events carry the system package, which is
            // noise on a row that is about the phone rather than about an app
            "app" to if (kind == "foreground" || kind == "background") event.packageName else null
          )
        )
      }
      out
    }
  }
}
```

- [ ] **Step 3: Widen the module's TS surface**

Replace `modules/usage-stats/index.ts`:

```ts
import { requireNativeModule } from 'expo';

const native = requireNativeModule('UsageStats');

export function ping(): string {
  return native.ping();
}

export function permission(): string {
  return native.permission();
}

export function openSettings(): boolean {
  return native.openSettings();
}

export async function queryDaily(from: number, to: number): Promise<{ app: string; ms: number; end: number }[]> {
  return await native.queryDaily(from, to);
}

export async function queryEvents(
  from: number,
  to: number
): Promise<{ at: number; kind: string; app: string | null }[]> {
  return await native.queryEvents(from, to);
}
```

- [ ] **Step 4: Write the failing tests for the TS source layer**

Create `src/lib/journal/__tests__/source.test.ts`:

```ts
import { fakeSource } from '../source';

describe('the fake source, which every test above this uses', () => {
  it('reports the grant it was given', async () => {
    expect(await fakeSource({ grant: 'denied' }).permission()).toBe('denied');
  });

  it('is granted and empty by default, which are different things', async () => {
    const s = fakeSource();
    expect(await s.permission()).toBe('granted');
    expect(await s.queryDaily(0, 1)).toEqual([]);
  });

  it('serves only the rows inside the window it was asked for', async () => {
    // a sync asks for its watermark onwards, and a source that ignored the
    // window would make every watermark test pass for the wrong reason
    const s = fakeSource({
      events: [
        { at: 100, kind: 'unlock', app: null },
        { at: 900, kind: 'unlock', app: null },
      ],
    });
    expect(await s.queryEvents(500, 1000)).toHaveLength(1);
  });

  it('throws when it was told to, so the error path is reachable in a test', async () => {
    await expect(fakeSource({ throws: 'no native module' }).queryDaily(0, 1)).rejects.toThrow(
      'no native module'
    );
  });
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `npx jest src/lib/journal/__tests__/source.test.ts`
Expected: FAIL — `Cannot find module '../source'`.

- [ ] **Step 6: Write the source layer**

Create `src/lib/journal/source.ts`:

```ts
import * as native from '../../../modules/usage-stats';
import type { DailyRow, EventKind, UsageEvent } from './store';

/**
 * The boundary between JARVIS and one Android API.
 *
 * An interface rather than a direct import, because the Kotlin half cannot run
 * under jest — so everything above this is tested against `fakeSource`, and the
 * native half is verified on the device by checklist and said to be so.
 */

export type Grant = 'granted' | 'denied' | 'unavailable';

export interface UsageSource {
  permission(): Promise<Grant>;
  openSettings(): Promise<void>;
  queryDaily(from: number, to: number): Promise<DailyRow[]>;
  queryEvents(from: number, to: number): Promise<UsageEvent[]>;
}

const KINDS: EventKind[] = ['foreground', 'background', 'screen_on', 'screen_off', 'unlock'];
const isKind = (k: string): k is EventKind => (KINDS as string[]).includes(k);

/** local YYYY-MM-DD, because a day boundary is a wall-clock question */
export const dayKey = (at: number): string => {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const androidSource: UsageSource = {
  async permission() {
    const answer = native.permission();
    return answer === 'granted' || answer === 'denied' ? answer : 'unavailable';
  },
  async openSettings() {
    native.openSettings();
  },
  async queryDaily(from, to) {
    // the bucket is stamped by its own end, not by the window asked for: one
    // call spans many days and every row has to land on the right one
    return (await native.queryDaily(from, to)).map((r) => ({
      day: dayKey(r.end),
      app: r.app,
      ms: r.ms,
    }));
  },
  async queryEvents(from, to) {
    return (await native.queryEvents(from, to))
      .filter((r) => isKind(r.kind))
      .map((r) => ({ at: r.at, kind: r.kind as EventKind, app: r.app }));
  },
};

/** the stand-in for the native module, for every test above this file */
export function fakeSource(
  seed: Partial<{ grant: Grant; daily: DailyRow[]; events: UsageEvent[]; throws: string }> = {}
): UsageSource {
  const boom = () => {
    if (seed.throws) throw new Error(seed.throws);
  };
  return {
    async permission() {
      boom();
      return seed.grant ?? 'granted';
    },
    async openSettings() {
      boom();
    },
    async queryDaily(from, to) {
      boom();
      // the window is honoured, or every watermark test above passes for the
      // wrong reason
      return (seed.daily ?? []).filter((d) => {
        const at = new Date(`${d.day}T12:00:00`).getTime();
        return at >= from && at <= to;
      });
    },
    async queryEvents(from, to) {
      boom();
      return (seed.events ?? []).filter((e) => e.at >= from && e.at <= to);
    },
  };
}
```

- [ ] **Step 7: Run to verify they pass**

Run: `npx jest src/lib/journal/__tests__/source.test.ts`
Expected: PASS, 4 tests.

`modules/usage-stats` must be mocked for jest, since `requireNativeModule` throws off-device. Add to `jest-setup.js`:

```js
jest.mock('./modules/usage-stats', () => ({
  ping: () => 'fake',
  permission: () => 'granted',
  openSettings: () => true,
  queryDaily: async () => [],
  queryEvents: async () => [],
}));
```

- [ ] **Step 8: Rebuild and verify the native half on the device**

```bash
npx expo prebuild --clean
npx expo run:android
```

Then, on the device: Settings → Apps → Special access → Usage access → J.A.R.V.I.S. → allow. Check the log shows `granted` before and after granting.

- [ ] **Step 9: Commit**

```bash
git add modules android src/lib/journal jest-setup.js
git commit -m "feat(journal): read Android's usage stats, behind an interface that fakes cleanly"
```

---

### Task 5: The sync — watermarks, four outcomes, and a lazy collector

**Files:**
- Create: `src/lib/journal/sync.ts`
- Test: `src/lib/journal/__tests__/sync.test.ts`

**Interfaces:**
- Consumes: `Journal` (Task 2), `UsageSource`, `fakeSource`, `dayKey` (Task 4)
- Produces:
  - `type SyncResult = { state: 'ok'; events: number; daily: number } | { state: 'denied' } | { state: 'error'; problem: string }`
  - `syncUsage(journal: Journal, source: UsageSource, now: number): Promise<SyncResult>`
  - `OVERLAP_MS`, `FIRST_RUN_EVENT_MS`, `FIRST_RUN_DAILY_MS`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/journal/__tests__/sync.test.ts`:

```ts
import { openJournal } from '../store';
import { fakeSource } from '../source';
import { FIRST_RUN_DAILY_MS, syncUsage } from '../sync';

const NOW = 1_800_000_000_000;
const fresh = () => openJournal(':memory:');

describe('syncing usage into the journal', () => {
  it('writes what it read and says how much', async () => {
    const j = await fresh();
    const s = fakeSource({
      events: [{ at: NOW - 1000, kind: 'unlock', app: null }],
      daily: [{ day: '2026-08-19', app: 'com.whatsapp', ms: 60_000 }],
    });
    const r = await syncUsage(j, s, NOW);
    expect(r).toEqual({ state: 'ok', events: 1, daily: expect.any(Number) });
    expect(await j.eventsBetween(0, NOW)).toHaveLength(1);
  });

  /**
   * The collector is allowed to be lazy because Android is the buffer: every
   * query is retroactive inside its retention window, so a missed run costs
   * nothing. That only holds if a second run over the same ground is free.
   */
  it('running twice changes nothing the second time', async () => {
    const j = await fresh();
    const s = fakeSource({ events: [{ at: NOW - 1000, kind: 'unlock', app: null }] });
    await syncUsage(j, s, NOW);
    const again = await syncUsage(j, s, NOW);
    expect(again).toEqual({ state: 'ok', events: 0, daily: expect.any(Number) });
  });

  it('reaches back a long way on a first run, and only forward after that', async () => {
    const j = await fresh();
    const asked: Array<[number, number]> = [];
    const s = fakeSource();
    const spy = { ...s, queryDaily: async (f: number, t: number) => (asked.push([f, t]), []) };

    await syncUsage(j, spy, NOW);
    expect(NOW - asked[0][0]).toBe(FIRST_RUN_DAILY_MS);

    await syncUsage(j, spy, NOW + 60_000);
    // the second run starts from the watermark, not from two years ago
    expect(NOW - asked[1][0]).toBeLessThan(FIRST_RUN_DAILY_MS);
  });

  it('reports denied without touching the journal', async () => {
    const j = await fresh();
    const r = await syncUsage(j, fakeSource({ grant: 'denied' }), NOW);
    expect(r).toEqual({ state: 'denied' });
    expect(await j.size()).toEqual({ events: 0, daily: 0 });
  });

  it('does not advance its watermark when the read failed', async () => {
    // otherwise a single bad sync silently skips that window forever, and the
    // gap is invisible afterwards — the worst shape a data bug can take
    const j = await fresh();
    const r = await syncUsage(j, fakeSource({ throws: 'native gone' }), NOW);
    expect(r.state).toBe('error');
    expect(await j.watermark('events')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/journal/__tests__/sync.test.ts`
Expected: FAIL — `Cannot find module '../sync'`.

- [ ] **Step 3: Write the sync**

Create `src/lib/journal/sync.ts`:

```ts
import type { Journal } from './store';
import type { UsageSource } from './source';

/**
 * Pull whatever is new into the journal.
 *
 * Called from the foreground, from the background task that already runs the
 * commute briefing, and from a button. No service, no scheduler, no foreground
 * notification — because the collector can afford to be lazy: every Android
 * query is retroactive inside its retention window, so a missed run costs
 * nothing. Only an app unopened for more than seven days loses per-day event
 * detail, and the daily aggregate for those days survives for months.
 */

export type SyncResult =
  | { state: 'ok'; events: number; daily: number }
  | { state: 'denied' }
  | { state: 'error'; problem: string };

/** windows overlap, so an event on a boundary is never dropped between runs */
export const OVERLAP_MS = 5 * 60_000;

/** Android keeps ~7 days of events; ask for all of it the first time */
export const FIRST_RUN_EVENT_MS = 7 * 24 * 60 * 60 * 1000;

/** and up to two years of daily buckets, which is why day one is not day zero */
export const FIRST_RUN_DAILY_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const since = async (j: Journal, source: string, now: number, firstRun: number): Promise<number> => {
  const mark = await j.watermark(source);
  return mark === null ? now - firstRun : Math.max(0, mark - OVERLAP_MS);
};

export async function syncUsage(j: Journal, source: UsageSource, now: number): Promise<SyncResult> {
  try {
    // asked every time rather than cached: this permission is revoked by hand in
    // Settings and the app is never told
    if ((await source.permission()) !== 'granted') return { state: 'denied' };

    const eventsFrom = await since(j, 'events', now, FIRST_RUN_EVENT_MS);
    const dailyFrom = await since(j, 'daily', now, FIRST_RUN_DAILY_MS);

    const [events, daily] = await Promise.all([
      source.queryEvents(eventsFrom, now),
      source.queryDaily(dailyFrom, now),
    ]);

    const wroteEvents = await j.putEvents(events);
    const wroteDaily = await j.putDaily(daily);

    // The watermarks move only after the write succeeded. Advancing them first
    // would turn one failed sync into a permanent hole: the window is never
    // asked for again, and nothing afterwards can tell that it is missing.
    await j.setWatermark('events', now);
    await j.setWatermark('daily', now);
    await j.prune(now);

    return { state: 'ok', events: wroteEvents, daily: wroteDaily };
  } catch (e) {
    return { state: 'error', problem: e instanceof Error ? e.message : 'unknown' };
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/lib/journal/__tests__/sync.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/journal
git commit -m "feat(journal): a lazy sync, and a watermark that never moves on a failure"
```

---

### Task 6: The Journal screen, and the three triggers

**Files:**
- Create: `src/screens/JournalScreen.tsx`
- Test: `src/screens/__tests__/journalScreen.test.tsx`
- Modify: `src/navigation/RootNavigator.tsx` (register the route)
- Modify: `src/screens/SettingsScreen.tsx` (a row that opens it)
- Modify: `src/lib/commuteTask.ts` (piggyback the sync)

**Interfaces:**
- Consumes: `openJournal`, `syncUsage`, `androidSource`, `summarise`, `describe`, `dayKey`
- Produces: `JournalScreen` (default-exported React component), route name `Journal`

- [ ] **Step 1: Write the failing test**

Create `src/screens/__tests__/journalScreen.test.tsx`:

```tsx
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppearanceProvider } from '../../theme/appearance';
import { JournalScreen } from '../JournalScreen';

const mockSync = jest.fn();
jest.mock('../../lib/journal/sync', () => ({ syncUsage: (...a: unknown[]) => mockSync(...a) }));
jest.mock('../../lib/journal/store', () => ({
  openJournal: async () => ({
    size: async () => ({ events: 12, daily: 3 }),
    dailyFor: async () => [{ day: '2026-08-19', app: 'com.instagram.android', ms: 3_600_000 }],
    eventsBetween: async () => [{ at: 1, kind: 'unlock', app: null }],
  }),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }) }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppearanceProvider>
        <JournalScreen />
      </AppearanceProvider>
    </SafeAreaProvider>
  );

describe('the Journal screen', () => {
  it('says what it is holding, so the collector is inspectable', async () => {
    mockSync.mockResolvedValue({ state: 'ok', events: 2, daily: 1 });
    const { getByTestId } = await mount();
    await waitFor(() => expect(getByTestId('journal-size').props.children).toContain('12'));
  });

  /**
   * The whole reason this screen exists. Without it, a revoked permission looks
   * identical to a quiet day, and this project has already spent an evening on
   * that exact confusion.
   */
  it('says the permission is off rather than showing an empty day', async () => {
    mockSync.mockResolvedValue({ state: 'denied' });
    const { getByTestId } = await mount();
    await waitFor(() => expect(getByTestId('journal-digest').props.children).toContain('cannot see'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/screens/__tests__/journalScreen.test.tsx`
Expected: FAIL — `Cannot find module '../JournalScreen'`.

- [ ] **Step 3: Write the screen**

Create `src/screens/JournalScreen.tsx`. Follow `SecurityScreen.tsx` for structure — `ScreenTitle`, the same row components, the same spacing. It must:

- open the journal once on mount, run `syncUsage` with `androidSource`, and hold the `SyncResult`
- render `<Text testID="journal-size">` with the row counts from `size()`
- render `<Text testID="journal-digest">` with `describe(summarise(...))` for today, **and when the sync came back `denied`, render `describe({ state: 'denied' })` rather than the digest of an empty day**
- offer a **Grant access** button when denied, calling `androidSource.openSettings()`
- offer a **Sync now** button that re-runs `syncUsage`

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/screens/__tests__/journalScreen.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Register the route and the way in**

In `src/navigation/RootNavigator.tsx`, add a `Journal` screen alongside the existing stack entries. In `src/screens/SettingsScreen.tsx`, add a row that navigates to it, matching the existing rows exactly.

- [ ] **Step 6: Piggyback the background sync**

In `src/lib/commuteTask.ts`, inside the registered task and **before** the briefing work, add:

```ts
// The journal rides the briefing's schedule rather than asking Android for one
// of its own: a second background registration competes with the first for the
// same budget, and the briefing is the one with a deadline.
try {
  const j = await openJournal();
  await syncUsage(j, androidSource, Date.now());
} catch {
  // the journal never costs the briefing its run
}
```

- [ ] **Step 7: Run the whole suite and the typecheck**

```bash
npm test
npm run typecheck
```

Expected: all green, and the count risen by the 27 tests this plan adds.

- [ ] **Step 8: Commit**

```bash
git add src/screens src/navigation src/lib/commuteTask.ts
git commit -m "feat(journal): a screen that says what has been collected, and three ways to collect"
```

---

## Device checklist — the part jest cannot cover

Run on the phone after Task 6. **None of this is proved by a green suite**, and
saying otherwise is the mistake this project has already made once.

- [ ] With access **not** granted, the screen says *"I cannot see your usage"* and offers the button
- [ ] The button opens Android's Usage access list
- [ ] After granting, **Sync now** returns rows, and the counts are non-zero
- [ ] The digest names apps you recognise, with plausible durations
- [ ] Revoke access in Settings, return, **Sync now** — it says *cannot see*, and does **not** say you used nothing
- [ ] Force-stop the app, reopen: the counts survive, so the database persisted
- [ ] Leave the phone overnight; next morning the briefing's background run has advanced the counts without the app being opened
