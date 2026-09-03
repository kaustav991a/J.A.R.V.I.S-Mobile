# Sightings to SQLite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the place-sighting store from one capped JSON blob in AsyncStorage to a SQLite table, so history stops being silently destroyed at 84 days and 1,200 rows.

**Architecture:** A new `src/lib/seenStore.ts` owns the table and every read and write. `src/lib/timeline.ts` keeps every exported signature it has today — its twenty-odd pure functions still take `seen: Seen[]` — so only its six I/O functions change and its ten callers change not at all. The old blob is migrated once on first open and then left in place, so a rollback loses nothing.

**Tech Stack:** expo-sqlite (already a dependency, used by `journal/store.ts` and `state/chatArchive.ts`), jest with `:memory:` databases, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-03-archive-import-design.md`, section *"2. The sighting store cannot hold seventeen months"*.

## Global Constraints

- **Every exported signature in `src/lib/timeline.ts` stays as it is.** Ten call sites across screens and lib depend on them; this plan changes storage, not the API.
- `Seen` stays `{ place: string; at: number; via?: 'enter' | 'exit' }`. The `'import'` value arrives in Plan B, not here.
- Follow `src/lib/journal/store.ts` for the SQLite idiom: `SQLite.openDatabaseAsync(name)`, `execAsync` for schema, `runAsync` and `getAllAsync` for rows, `':memory:'` in tests.
- Every store function is silent on failure and returns an empty answer, exactly as `loadSeen` does today. A sighting that cannot be read must never take a screen down.
- Run the whole suite before every commit: `npx jest`. Never pipe it into `tail` inside an `&&` chain — the pipeline exits with tail's status and a red suite reads as green.
- Do not write regexes into files through a JS template literal in a patch script; backslashes are eaten silently. Use a quoted heredoc into a `.txt` and splice.

---

### Task 1: The table, and the reads and writes it owns

**Files:**
- Create: `src/lib/seenStore.ts`
- Test: `src/lib/__tests__/seenStore.test.ts`

**Interfaces:**
- Consumes: the `Seen` type from `src/lib/timeline.ts` (type-only import, no cycle).
- Produces: `openSeenStore(name?: string): Promise<SeenStore>`. `SeenStore` has exactly these methods, and later tasks call them by these names:
  - `all(limit: number): Promise<Seen[]>` — newest `limit` rows, returned oldest-first
  - `between(from: number, to: number): Promise<Seen[]>` — inclusive, oldest-first
  - `put(rows: Seen[]): Promise<void>`
  - `drop(ats: number[]): Promise<void>`
  - `clear(): Promise<void>`
  - `held(): Promise<number>`
  - `oldest(): Promise<number | null>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/seenStore.test.ts`. Ten cases, and the last two are the ones that catch real bugs: an empty store must answer rather than throw, and an app-open sighting must come back with no `via` key at all, because `via` is tested for truthiness across the codebase.

Cases to write, each one assertion:
1. a sighting put is read back identically
2. `all(2)` over three rows returns the newest two
3. rows come back oldest-first
4. putting the same moment twice leaves `held()` at 1
5. `between(2000, 6000)` returns only the row inside it
6. `drop([at])` removes that row and keeps the others
7. `clear()` empties it
8. `held()` and `oldest()` report 2 and the earliest moment
9. an empty store returns `[]` and `null`, no throw
10. `'via' in row` is false for an app-open sighting

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/lib/__tests__/seenStore.test.ts`
Expected: FAIL, `Cannot find module '../seenStore'`.

- [ ] **Step 3: Write the store**

Create `src/lib/seenStore.ts`. Schema, and the file's own reason for existing at the top:

```
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS sighting (
  at INTEGER PRIMARY KEY,
  place TEXT NOT NULL,
  via TEXT
);
CREATE INDEX IF NOT EXISTS sighting_place ON sighting (place, at);
```

Follow `src/lib/journal/store.ts` exactly: `openDatabaseAsync(name)`, `execAsync(SCHEMA)`, then return an object of closures.

Implementation notes that matter:
- `all(limit)` queries `ORDER BY at DESC LIMIT ?` then `.reverse()`, because readers want oldest-first but the cap must take the newest
- `put` uses `INSERT OR IGNORE`, so a repeated save costs nothing and `at` is the identity
- the row-to-`Seen` mapper omits `via` entirely when the column is null, rather than setting it undefined
- `held()` and `oldest()` use `getFirstAsync` with `COUNT(*)` and `MIN(at)`, and both default to a number rather than throwing

- [ ] **Step 4: Run the test, then the suite**

Run: `npx jest src/lib/__tests__/seenStore.test.ts` — expect 10 passing.
Run: `npx jest` — expect green. Nothing consumes the store yet, so a red suite here means the new file broke a type somewhere.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seenStore.ts src/lib/__tests__/seenStore.test.ts
git commit -m "feat(sightings): a table that can hold more than eighty-four days"
```

---

### Task 2: Migrate the blob once, and never delete it

**Files:**
- Modify: `src/lib/seenStore.ts`
- Test: `src/lib/__tests__/seenStore.test.ts`

**Interfaces:**
- Consumes: `SeenStore` from Task 1.
- Produces: `migrateOnce(store: SeenStore): Promise<number>` — how many rows moved; `0` if it had already run, there was nothing to move, or the blob was unreadable.

- [ ] **Step 1: Write the failing test**

Append a `describe('moving the blob across')` with `beforeEach(() => AsyncStorage.clear())` and six cases:

1. two rows seeded under `jarvis_place_seen` move across, and `all(10)` returns both in order
2. after migrating, `AsyncStorage.getItem('jarvis_place_seen')` is **still not null** — the blob is kept
3. calling `migrateOnce` twice returns `2` then `0`, and `held()` stays at 2
4. an empty AsyncStorage migrates `0`
5. a blob of `'not json at all'` migrates `0` rather than throwing
6. a blob containing `[{valid}, {nonsense: true}, null]` migrates exactly `1`

Case 2 is the one that matters. Case 6 is the rule the old reader already followed: this file outlives the code that wrote it, so a shape from an older build has to be survivable.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/lib/__tests__/seenStore.test.ts`
Expected: FAIL, `migrateOnce` is not exported.

- [ ] **Step 3: Write the migration**

In `src/lib/seenStore.ts`:

- `const BLOB_KEY = 'jarvis_place_seen'` — verbatim, because the blob is not deleted
- `const MOVED_KEY = 'jarvis_place_seen_moved'` — the marker that stops it running twice
- an `isSeen` guard checking `place` is a string and `at` is a finite number
- `migrateOnce`: return 0 if the marker exists; read, `JSON.parse`, filter through the guard, `put` the survivors, write the marker, return the count; the whole body in a `try` that returns 0

**Keep the blob.** It costs a few kilobytes and it is the only way back if this migration is wrong — and a store holding twelve weeks of somebody's movements is not where you discover that the hard way.

- [ ] **Step 4: Run the test, then the suite**

Run: `npx jest src/lib/__tests__/seenStore.test.ts` — expect 16 passing.
Run: `npx jest` — green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seenStore.ts src/lib/__tests__/seenStore.test.ts
git commit -m "feat(sightings): move the blob across once, and keep it"
```

---

### Task 3: Point timeline.ts at the table without changing its API

**Files:**
- Modify: `src/lib/timeline.ts` — six functions only: `loadSeen` (~line 91), `noteSeen` (~120), `dropExitsAround` (~156), `pruneSweepExits` (~198), `forgetCrossing` (~296), `forgetSeen` (~308)
- Test: `src/lib/__tests__/timelineStore.test.ts` (create)

**Interfaces:**
- Consumes: `openSeenStore`, `migrateOnce`, `SeenStore` from Tasks 1 and 2.
- Produces, from `src/lib/timeline.ts`:
  - `useSeenStore(s: SeenStore | null): void` — for tests, and for the switch that forgets everything
  - `SEEN_WINDOW: number` — how many rows a plain `loadSeen()` reads
  - every other export unchanged

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/timelineStore.test.ts`, with `beforeEach` clearing AsyncStorage and calling `useSeenStore(await openSeenStore(':memory:'))`, and `afterEach(() => useSeenStore(null))`. Five cases:

1. `noteSeen('Office', 1000, 'exit')` then `loadSeen()` returns exactly that row
2. **a sighting a year old survives** — the case the blob destroyed, and the reason this plan exists
3. the same crossing written twice is stored once
4. two app-open sightings a minute apart at one place collapse to one
5. `forgetSeen()` empties it

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/lib/__tests__/timelineStore.test.ts`
Expected: FAIL, `useSeenStore` is not exported.

- [ ] **Step 3: Rewire the six functions**

At the top of `timeline.ts`, add the lazy holder: a module-scope `store` and `opening`, `useSeenStore` to set it, and a `theStore()` that opens the real database once and runs `migrateOnce` before returning it. A failure to open resolves to `null`, and every caller treats `null` as an empty store.

Then, keeping signatures exactly:

- `loadSeen()` → `s.all(SEEN_WINDOW)`, `[]` on failure. **Delete the `SEEN_TTL_MS` cutoff filter** — that line is what destroyed history.
- `noteSeen(place, at, via)` → read `s.all(SEEN_WINDOW)` for the two dedupe rules that already exist (identical crossing within 60 s; app-open inside `SAME_VISIT_MIN`), then `s.put([row])`.
- `dropExitsAround(at, place, windowMs, far)` → same burst logic, but `s.drop(doomed.map((x) => x.at))` instead of rewriting a blob.
- `pruneSweepExits(windowMs, far)` → keep the entire body; replace only the final write with `s.drop([...swept])`, and keep returning `seen.length - kept.length`.
- `forgetCrossing(at)` → `s.drop([at])`, after checking a crossing with that moment exists.
- `forgetSeen()` → `s.clear()`.

Then delete the `KEY` constant and the `AsyncStorage` import from `timeline.ts` if nothing else in the file uses them. Leave `SEEN_TTL_MS` and `SEEN_KEEP` exported — other modules import them — but stop reading them here.

- [ ] **Step 4: Run the tests and fix the seeding in the old ones**

Run: `npx jest src/lib/__tests__/timelineStore.test.ts` — expect 5 passing.
Run: `npx jest` — **expect failures**, because several suites seed the store by writing `AsyncStorage.setItem('jarvis_place_seen', …)` directly. For each, seed through the store instead:

```
useSeenStore(await openSeenStore(':memory:'));
await noteSeen(place, at, via);   // or store.put(rows) where the test holds the store
```

Do not weaken an assertion to make a test pass. If a test asserted that an old sighting disappears, that behaviour is deliberately gone: rewrite it to assert the row survives, and say so in the test's comment.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
npx jest
git add src/lib/timeline.ts src/lib/__tests__
git commit -m "refactor(sightings): read and write the table, same API"
```

---

### Task 4: Let the habit figures see a year

**Files:**
- Modify: `src/lib/timeline.ts`
- Test: `src/lib/__tests__/timelineStore.test.ts`

**Interfaces:**
- Consumes: the private `theStore()` from Task 3.
- Produces: `seenSince(days: number): Promise<Seen[]>` from `src/lib/timeline.ts`.

- [ ] **Step 1: Write the failing test**

Append two cases:

1. two sightings, one 200 days old and one yesterday: `seenSince(365)` returns both, `seenSince(30)` returns one
2. with `useSeenStore(null)`, `seenSince(365)` returns `[]` rather than throwing

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/lib/__tests__/timelineStore.test.ts`
Expected: FAIL, `seenSince` is not exported.

- [ ] **Step 3: Implement it**

`seenSince(days)` calls `s.between(Date.now() - days * 86_400_000, Date.now())` inside a try, `[]` on failure. Its doc comment says why both readers exist: `loadSeen()` runs on every screen focus and wants a window, while the habit figures want as much as there is — and after the migration there is more than there was.

- [ ] **Step 4: Run the tests**

Run: `npx jest src/lib/__tests__/timelineStore.test.ts` — expect 7 passing. Then `npx jest` — green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline.ts src/lib/__tests__/timelineStore.test.ts
git commit -m "feat(sightings): read further back than the render window"
```

---

### Task 5: Say what the store holds, before anything depends on it

**Files:**
- Modify: `src/lib/timeline.ts`
- Modify: `src/screens/PlacesScreen.tsx` — the **Crossings recorded** row, near `testID="crossings-swept"`
- Test: `src/lib/__tests__/timelineStore.test.ts`

**Interfaces:**
- Consumes: `theStore()` from Task 3.
- Produces: `storeHeld(): Promise<{ rows: number; days: number }>` from `src/lib/timeline.ts`.

- [ ] **Step 1: Write the failing test**

Two cases: a sighting 100 days old plus one yesterday reports `{ rows: 2, days: 100 }`; an empty store reports `{ rows: 0, days: 0 }` rather than nulls.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/lib/__tests__/timelineStore.test.ts`
Expected: FAIL, `storeHeld` is not exported.

- [ ] **Step 3: Implement, then show it on screen**

`storeHeld()` returns `held()` and the age of `oldest()` in whole days, `{ rows: 0, days: 0 }` on any failure.

In `PlacesScreen.tsx`: add `const [held, setHeld] = useState({ rows: 0, days: 0 })` beside the existing `crossed` and `sweeps` state, read it in the same focus effect with `void storeHeld().then(l.only(setHeld))`, and render one line inside the Crossings row under the swept line, `testID="crossings-held"`:

> `N sightings held, reaching back M days.` — or `Nothing held yet.` when rows is 0

A migration nobody can see is a migration nobody can trust. This row exists **before** the import does, so *the import found nothing* and *the store is empty* can never be confused — the confusion this project has now shipped five times.

- [ ] **Step 4: Run everything**

```bash
npx tsc --noEmit
npx jest
```

Expect 9 passing in `timelineStore.test.ts`, and the full suite green.

- [ ] **Step 5: Commit, publish, and check on the device**

```bash
git add src/lib/timeline.ts src/screens/PlacesScreen.tsx src/lib/__tests__/timelineStore.test.ts
git commit -m "feat(sightings): say how much is held and how far back"
npx expo-updates fingerprint:generate --platform android
npx eas update --channel production --platform android --environment production \
  --message "Sightings in a table, and a row that says how much" --non-interactive
```

The fingerprint **must not move** — this plan is JavaScript only. If it moved, something native changed and that needs a build before the publish reaches the phone.

On the device: Places → Crossings recorded should read *"N sightings held, reaching back M days"*, where N is roughly what the blob held. **If it reads zero, the migration did not run** — and that is the bug to chase, not the import.

---

## Self-review

**Spec coverage.** This plan implements the spec's section 2 in full — the table, the migration, the preserved API, the longer read, and the diagnostic. Sections 1 (Kotlin streaming), 3 (`via: 'import'`), the naming flow and the import screen are **deliberately absent**: they are Plan B, they depend on this, and they cannot be tested without it.

**Placeholders.** None. Task 3's test-repair step names the exact substitution rather than saying *fix the tests*, and every step says what to run and what to expect.

**Type consistency.** `SeenStore`'s seven methods are named identically in Tasks 1, 3, 4 and 5. `useSeenStore`, `seenSince`, `storeHeld`, `migrateOnce` and `SEEN_WINDOW` appear with one signature each wherever they are used. `Seen` is unchanged throughout and `'import'` is not introduced.

**Two risks worth naming before starting.**

1. **Task 3 will break existing tests**, and the honest fix is to rewrite their seeding rather than keep a compatibility shim. Expect the suite to be red in the middle of that task; that is the plan working, not failing.
2. **A migration that silently does nothing is the worst outcome** — the app would run on an empty store while twelve weeks of history sat in a blob nobody reads. Task 5 exists to make that impossible to miss, which is why it is in this plan and not deferred to Plan B.

## What Plan B will need from this

- `via` widened to include `'import'`, and the habit functions counting it while never reporting it as `measured`
- `seenSince(days)` as the read the matcher uses to dedupe against existing history
- `storeHeld()` extended, or a sibling added, to report imported rows separately from measured ones
