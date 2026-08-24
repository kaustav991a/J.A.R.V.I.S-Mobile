# App Completion Implementation Plan — jarvis-mobile

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take `jarvis-mobile` from "built, partly unexercised" to every §0c criterion that can be met without touching `jarvis-brain`, and state precisely which criteria cannot.

**Architecture:** Pure logic lands in `src/lib/*.ts` with its own unit tests; screens read it and stay dumb. Native reach (`BOOT_COMPLETED`, the notification listener) follows the existing local-module pattern in `modules/` plus a config plugin in `plugins/`, because `expo prebuild` regenerates `android/` and a hand edit there silently reverts — this repo's most expensive recurring bug class. Anything derived from a sense is reduced to booleans/counts at the point of capture, never stored raw.

**Tech Stack:** Expo SDK 57, React Native 0.86.2, React 19.2.3, TypeScript 6.0.3, Jest 29 + `jest-expo` + `@testing-library/react-native`, `expo-updates` (OTA, channel `production`), local Expo modules (`modules/app-launcher`, `modules/usage-stats`).

**Spec:** `ROADMAP.md` — §0c is the definition of complete; §1–§6 hold the detail; §7 is the background-execution measurement every §3.1 decision is made against.

## Global Constraints

- **Brain is off limits.** No file under `../jarvis-brain/` is read for edit or written. Any item needing a gateway route, a deploy, or the desk is recorded as blocked, not attempted.
- **Baseline to protect:** 883 tests, 70 suites, `npx tsc --noEmit` clean. Verified 2026-08-24. No task may land red.
- **Every state names itself** (§4.3). A row, log line or panel must distinguish *failed*, *never asked*, and *succeeded-with-nothing-to-say*. A silent failure in a security path is a security failure.
- **`unavailable` stays silent** (§4.3). Never announce "all clear" for a lookup that failed.
- **Direction of failure for the briefing is chosen and must not be reversed** (`commute.ts`): a missing, unreadable or stale stamp means the phone posts. A duplicate is an annoyance; a silent morning is the feature not existing.
- **Raw never leaves the phone** (§4.1.2): not notification text, not screen content, not SMS bodies, not call rows. Derived facts only — booleans, counts, aliases. Copy `shareFacts` in `src/lib/journal/`, do not reinvent.
- **Never logged, not even truncated** (§4.1.3). A log line is a permanent copy in someone else's system.
- **OTP and financial content dropped at the point of capture** (§4.1.4), never filtered downstream of storage.
- **Colour is never the only signal** (§5.1.4). Every state carries a word as well as a dot.
- **A synchronous `setState` inside `useFocusEffect` loops forever** under this repo's screen-test mock, which calls the callback during render. Defer with a microtask — see `HomeScreen.tsx:107-130`.
- **Native config goes in `plugins/`, never `android/`.** `plugins/withArm64Only.js` is the pattern.
- **OTA ships JS-only work:** `eas update --branch production --environment production --platform android`. Channel verified Active 2026-08-24, runtime `31c64113d7d13a400eb1c56ef81c4d0d4be3fa17` matching the installed APK. A **local** build receives nothing unless that fingerprint is baked by hand.
- **Commit per task.** Conventional prefixes as used in this repo's history (`feat(mobile):`, `fix(chat):`, `docs:`).

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/lib/commute.ts` (modify) | add `cloudArmedState()` beside `cloudArmed()`; the boolean gate keeps its meaning, the tri-state is for display | 1 |
| `src/lib/status.ts` (modify) | `StatusFacts.scheduleAtGateway` becomes a tri-state; the row stops calling *unknown* *off* | 1 |
| `src/screens/HomeScreen.tsx` (modify) | feed the tri-state in | 1 |
| `src/state/JarvisProvider.tsx` (modify) | one cancellation helper; every async effect routed through it | 2 |
| `src/lib/crashLog.ts` (create) | persist a JS crash so it survives the restart that hides it | 3 |
| `src/components/CrashBoundary.tsx` (create) | catch, persist, offer a way back | 3 |
| `src/lib/speech.ts` (create) | pure decision of *whether and what* to speak; no native import at module scope | 4 |
| `plugins/withBootCompleted.js` (create) | `RECEIVE_BOOT_COMPLETED` + receiver, in a plugin so `prebuild` cannot revert it | 5 |
| `src/lib/notifications/derive.ts` (create) | reduce a notification to a derived fact or to nothing; the drop rules live here | 6 |

---

## Task 1: The briefing-schedule row stops lying

`ROADMAP.md` §2.1 closing paragraph. `markCloudArmed` is written only on a successful `syncCommute`, and that effect returns early unless `link.mode === 'cloud'` (`JarvisProvider.tsx:962`). A run of LAN-only sessions therefore ages the stamp past `CLOUD_TTL_HOURS`, and the panel reports `off` / `ON THIS PHONE` — asserting the gateway does not hold the schedule, when in fact the phone merely has not spoken to the gateway since.

**The roadmap's other option — "stamp on any successful upload regardless of transport" — is not implementable here and is deliberately not attempted.** `api.syncCommute` posts to `/app-commute` via `postCloud` (`src/api/client.ts:186`). There is no LAN upload to stamp. Adding one is a gateway route, which is brain work.

**Behaviour is unchanged for the briefing itself.** A stale stamp still means the phone posts — the chosen direction of failure. Only the panel's *claim* changes.

**Files:**
- Modify: `src/lib/commute.ts` (after `cloudArmed`, ~line 280)
- Modify: `src/lib/status.ts:67` (type), `src/lib/status.ts:126-134` (row)
- Modify: `src/screens/HomeScreen.tsx:107`, `:127-129`, `:456`
- Test: `src/lib/__tests__/commute.test.ts`, `src/lib/__tests__/status.test.ts`

**Interfaces:**
- Consumes: `CLOUD_TTL_HOURS`, `CLOUD_KEY` (module-private), `AsyncStorage`.
- Produces:
  - `export type CloudArmedState = 'armed' | 'stale' | 'never'`
  - `export async function cloudArmedState(now?: Date): Promise<CloudArmedState>`
  - `StatusFacts.scheduleAtGateway: CloudArmedState` (was `boolean`)

- [ ] **Step 1: Write the failing tests for `cloudArmedState`**

In `src/lib/__tests__/commute.test.ts`, beside the existing cases that cover whether the gateway holds the schedule:

```ts
describe('what the phone can honestly claim about the gateway', () => {
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

  it('treats a clock that moved backwards as stale, not armed', async () => {
    await markCloudArmed(now.getTime() + 86_400_000);
    await expect(cloudArmedState(now)).resolves.toBe('stale');
  });

  it('keeps the boolean gate agreeing with the tri-state', async () => {
    await markCloudArmed(hoursAgo(CLOUD_TTL_HOURS + 1));
    expect(await cloudArmed(now)).toBe(false);
    expect(await cloudArmedState(now)).toBe('stale');
  });
});
```

Add `cloudArmedState` to the import list at the top of that file. Reuse the file's existing `now` / `hoursAgo` helpers rather than declaring new ones.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx jest src/lib/__tests__/commute.test.ts -t "honestly claim"`
Expected: FAIL — `cloudArmedState is not a function`.

- [ ] **Step 3: Implement `cloudArmedState`**

In `src/lib/commute.ts`, directly below `cloudArmed`:

```ts
/**
 * `never` means no upload has ever been accepted, so the phone is certainly the
 * briefer. `stale` means one was, long enough ago that it proves nothing now.
 */
export type CloudArmedState = 'armed' | 'stale' | 'never';

/**
 * The same read as `cloudArmed`, but it distinguishes the two ways of not being armed.
 *
 * `cloudArmed` collapses them on purpose — the task's decision is binary and the
 * direction of its failure is chosen. The panel's job is the opposite one: a stamp
 * that has merely aged is not evidence that the gateway lost the schedule, and a row
 * that says `ON THIS PHONE` for both is asserting something the phone cannot know.
 *
 * Why the stamp ages at all while the gateway may be perfectly armed: it is written
 * only by `syncCommute`, and that effect returns early unless the link is `cloud`
 * (`JarvisProvider.tsx`). A week of workspace-only sessions is enough.
 *
 * A stamp from the future is `stale` rather than `armed`: the clock moved, so the
 * age is meaningless, and meaningless must not read as proved.
 */
export async function cloudArmedState(now: Date = new Date()): Promise<CloudArmedState> {
  try {
    const raw = await AsyncStorage.getItem(CLOUD_KEY);
    const at = Number(raw);
    if (!raw || !Number.isFinite(at)) return 'never';
    const age = now.getTime() - at;
    if (age < 0) return 'stale';
    return age <= CLOUD_TTL_HOURS * 3_600_000 ? 'armed' : 'stale';
  } catch {
    // an unreadable store is not evidence about the gateway either way
    return 'never';
  }
}
```

- [ ] **Step 4: Run them and confirm they pass**

Run: `npx jest src/lib/__tests__/commute.test.ts`
Expected: PASS, and the existing `cloudArmed` cases still pass untouched.

- [ ] **Step 5: Write the failing status-row tests**

In `src/lib/__tests__/status.test.ts`, update the helper that builds `StatusFacts` so `scheduleAtGateway` is `'never'` instead of `false` wherever it appears, then add:

```ts
it('names the gateway as holding the schedule when the stamp is fresh', () => {
  const row = rowById(statusRows(facts({ scheduleAtGateway: 'armed' })), 'schedule');
  expect(row.state).toBe('on');
  expect(row.word).toBe('AT THE GATEWAY');
});

it('refuses to claim the phone is briefing when the stamp has merely aged', () => {
  const row = rowById(statusRows(facts({ scheduleAtGateway: 'stale' })), 'schedule');
  expect(row.state).toBe('unknown');
  expect(row.word).toBe('CANNOT TELL');
  expect(row.note).toContain('may still hold');
});

it('says the phone is briefing only when nothing was ever uploaded', () => {
  const row = rowById(statusRows(facts({ scheduleAtGateway: 'never' })), 'schedule');
  expect(row.state).toBe('off');
  expect(row.word).toBe('ON THIS PHONE');
});

it('does not count a stale stamp as something that is off', () => {
  expect(offCount(statusRows(facts({ scheduleAtGateway: 'stale' })))).toBe(
    offCount(statusRows(facts({ scheduleAtGateway: 'armed' })))
  );
});
```

If the file has no `rowById` helper, add `const rowById = (rows: StatusRow[], id: string) => rows.find((r) => r.id === id)!;` beside the existing helpers.

- [ ] **Step 6: Run them and confirm they fail**

Run: `npx jest src/lib/__tests__/status.test.ts`
Expected: FAIL — the `stale` case reports `state: 'off'`, and `tsc` objects to a string where a boolean is declared.

- [ ] **Step 7: Widen the type and the row**

`src/lib/status.ts` — add `import type { CloudArmedState } from './commute';` and replace the `scheduleAtGateway` field:

```ts
  /**
   * What the phone can claim about the gateway holding the commute schedule —
   * `cloudArmedState()` in `commute.ts`. Three states rather than two because the
   * stamp is written only on a cloud connect: workspace-only sessions age it while
   * the gateway may be armed perfectly well, and one red row for both sends someone
   * hunting a fault that does not exist.
   */
  scheduleAtGateway: CloudArmedState;
```

Then the row:

```ts
    {
      id: 'schedule',
      label: 'Briefing schedule',
      // three states, because the stamp ages on a workspace-only week while the
      // gateway may still be armed — see `cloudArmedState`. Claiming the phone is
      // briefing is a claim about the gateway, and it is one this row cannot make
      // from a stale stamp
      ...(f.scheduleAtGateway === 'armed'
        ? { state: 'on' as const, word: 'AT THE GATEWAY' }
        : f.scheduleAtGateway === 'stale'
          ? {
              state: 'unknown' as const,
              word: 'CANNOT TELL',
              note: 'Not uploaded in two days. The gateway may still hold it; the phone will brief as well.',
            }
          : {
              state: 'off' as const,
              word: 'ON THIS PHONE',
              note: 'The phone is briefing, which it often cannot.',
            }),
    },
```

- [ ] **Step 8: Run them and confirm they pass**

Run: `npx jest src/lib/__tests__/status.test.ts && npx tsc --noEmit`
Expected: tests PASS; `tsc` reports the `HomeScreen` mismatch, which Step 9 fixes.

- [ ] **Step 9: Feed the tri-state in from Home**

`src/screens/HomeScreen.tsx` — the state and its read:

```tsx
  const [scheduleAtGateway, setScheduleAtGateway] = useState<CloudArmedState>('never');
```

```tsx
      void cloudArmedState().then((state) => {
        if (alive) setScheduleAtGateway((prev) => (prev === state ? prev : state));
      });
```

Update the import from `../lib/commute` to bring in `cloudArmedState` and the type, and drop `cloudArmed` if this was its only use in the file. Keep the microtask deferral exactly as it is — a synchronous `setState` here loops forever under the screen-test mock.

- [ ] **Step 10: Full suite and typecheck**

Run: `npx tsc --noEmit && npx jest`
Expected: `tsc` clean; 70 suites pass; the total climbs from 883 by the number of cases added.

- [ ] **Step 11: Commit**

```bash
git add src/lib/commute.ts src/lib/status.ts src/screens/HomeScreen.tsx src/lib/__tests__/commute.test.ts src/lib/__tests__/status.test.ts
git commit -m "fix(mobile): a stale stamp is not evidence the gateway lost the schedule"
```

---

## Task 2: Make the provider's async effects cancellable, and collect the debt it is holding

`ROADMAP.md` §2.1 *"Still owed"*, plus the two comment blocks at the foot of `src/state/__tests__/jarvisProvider.test.tsx`. A provider effect that resolves after its test body has finished does so outside any `act`; enough of those corrupt the act environment, after which every later `render` in the file returns an **empty tree** — no throw, no warning, queries finding nothing. It has cost six tests, and it is why the `markCloudArmed` wiring has no test despite being the wiring that stops the briefing arriving twice.

What was already tried is recorded in that file: unmounting every view was necessary and insufficient; one empty `act` before each unmount took five violations to four; `await Promise.resolve()` inside it reached zero and then ran the heap out, because draining chained microtasks lets the provider re-arm its own effects without bound. The file's own conclusion — **the real fix is cancellation at the source, not a guard inside each `.then`** — is this task.

**Files:**
- Modify: `src/state/JarvisProvider.tsx`
- Test: `src/state/__tests__/jarvisProvider.test.tsx`

**Interfaces:**
- Produces: a module-private `useCancellable()` returning `run(fn)`, where `fn` receives an `alive()` predicate and the hook drops every pending continuation on unmount. No public API change — `JarvisContextValue` is untouched, so no consumer or screen test moves.

- [ ] **Step 1: Inventory every async effect in the provider**

Run: `grep -n "void \|\.then(\|async () =>" src/state/JarvisProvider.tsx`
Record the line of each effect that calls a setter after an `await`. Every one is a site this task converts. Change nothing while inventorying — an inventory written from memory is the stale assumption this project has already paid for twice.

- [ ] **Step 2: Write the failing test that the harness currently makes impossible**

The `OWED` block in `jarvisProvider.test.tsx` names it: the provider calling `markCloudArmed` on a successful upload and not on a failed one. Place it **last** in the file, so a pre-existing act violation cannot blank it, and assert through the mock rather than through a render. Use the file's existing harness helpers (`finish`, and whatever it already uses to open a cloud link) rather than inventing new ones:

```tsx
describe('the stamp that makes the phone a fallback rather than a second sender', () => {
  it('stamps when the gateway accepts the schedule', async () => {
    const marked = jest.spyOn(commute, 'markCloudArmed');
    api.syncCommute.mockResolvedValue(undefined);
    const view = render(<Harness />);
    await act(async () => { await openCloudLink(); });
    await waitFor(() => expect(api.syncCommute).toHaveBeenCalled());
    await waitFor(() => expect(marked).toHaveBeenCalled());
    await finish(view);
  });

  it('does not stamp when the upload is refused', async () => {
    const marked = jest.spyOn(commute, 'markCloudArmed');
    api.syncCommute.mockRejectedValue(new Error('502'));
    const view = render(<Harness />);
    await act(async () => { await openCloudLink(); });
    await waitFor(() => expect(api.syncCommute).toHaveBeenCalled());
    expect(marked).not.toHaveBeenCalled();
    await finish(view);
  });
});
```

- [ ] **Step 3: Run it and record the failure mode precisely**

Run alone: `npx jest src/state/__tests__/jarvisProvider.test.tsx -t "second sender"`
Then the whole file: `npx jest src/state/__tests__/jarvisProvider.test.tsx`
Expected, and this is the point: it may pass alone and fail in the file. Write down which, because that difference *is* the bug, and it is the evidence that Step 5 worked.

- [ ] **Step 4: Add the cancellation helper**

In `src/state/JarvisProvider.tsx`, above the component:

```tsx
/**
 * Run async work that must stop existing when the provider unmounts.
 *
 * Not a convenience. A `.then` that fires after its test's body has finished runs
 * outside `act`, and enough of those corrupt the act environment for the rest of the
 * file — after which `render` returns an empty tree with no throw and no warning. Six
 * tests were lost to that, and the guard-inside-each-`.then` version was tried and was
 * not sufficient, because the guard still lets the continuation run.
 *
 * On the device the same shape prevents a setter firing on an unmounted tree during a
 * link flap, which is the ordinary reason to want it.
 */
function useCancellable() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return useCallback((fn: (alive: () => boolean) => Promise<void>) => {
    void fn(() => alive.current).catch(() => {
      // a rejected effect is the effect's own business; it must not take the tree
    });
  }, []);
}
```

- [ ] **Step 5: Route each effect from Step 1 through it**

For every site inventoried, the shape becomes — using `syncCommute`'s effect as the worked example:

```tsx
  const run = useCancellable();

  useEffect(() => {
    if (link.mode !== 'cloud' || link.status !== 'open') return;
    run(async (alive) => {
      await syncCommute();
      if (!alive()) return;
    });
  }, [link.mode, link.status, syncCommute, run]);
```

Where an effect writes state after its `await`, `if (!alive()) return;` goes immediately before the write, not at the top. **Convert one site, run the file, then the next.** Converting all of them before running once makes a regression impossible to attribute.

- [ ] **Step 6: Run the file, then the suite**

Run: `npx jest src/state/__tests__/jarvisProvider.test.tsx`
Expected: the two new tests pass **in the file**, not only alone.
Then: `npx jest && npx tsc --noEmit`
Expected: 70 suites pass, `tsc` clean.

- [ ] **Step 7: Retire the stale comment blocks**

Replace the `OWED` block with a one-line note saying it is covered and where. Rewrite the `PARTLY FIXED FAULT` block to say what the fix was and what it bought, keeping the record of what was tried — that history is why the fix is shaped this way. If any act violations remain, say how many rather than implying none.

- [ ] **Step 8: Commit**

```bash
git add src/state/JarvisProvider.tsx src/state/__tests__/jarvisProvider.test.tsx
git commit -m "fix(mobile): provider effects that outlive their tree, and the six tests they cost"
```

---

## Task 3: A crash is visible

`ROADMAP.md` §0c item 8 and §6 *"Crash and error reporting"*. A crash here is currently silent: the app restarts and the only diagnosis is `adb logcat` on the one machine that built the APK.

**Scope is deliberately the JS half.** A JS error is caught, persisted, and shown. A **native** crash still needs a reporting service and a native build, and that stays owed — recorded, not quietly folded in. Doing the JS half OTA-shippable today is worth more than waiting for the other half.

Persist through whichever store `src/lib/journal/` already uses, for one storage story rather than two. **The crash record is derived, never raw:** error name, message, the top frames of the component stack, a timestamp, and the runtime version. No user content, no chat text, no token — §4.1.3 applies to a local store too, because a crash log is exactly what gets pasted into a chat window.

**Files:**
- Create: `src/lib/crashLog.ts`, `src/lib/__tests__/crashLog.test.ts`
- Create: `src/components/CrashBoundary.tsx`, `src/components/__tests__/CrashBoundary.test.tsx`
- Modify: `App.tsx` (wrap), and the settings screen that lists diagnostics

**Interfaces:**
- Produces:
  - `export type CrashRecord = { at: number; name: string; message: string; frames: string[]; runtime: string }`
  - `export async function recordCrash(e: unknown, componentStack?: string): Promise<void>`
  - `export async function readCrashes(): Promise<CrashRecord[]>` — newest first, capped at 20
  - `export async function clearCrashes(): Promise<void>`
  - `<CrashBoundary>` — renders children; on error persists and renders a reactor-themed panel naming the error, with a "carry on" control that remounts the tree.

- [ ] **Step 1: Write the failing tests for the store**

```ts
it('keeps the newest crash first and caps the list', async () => {
  for (let i = 0; i < 25; i += 1) await recordCrash(new Error(`boom ${i}`), 'at Thing');
  const all = await readCrashes();
  expect(all).toHaveLength(20);
  expect(all[0].message).toBe('boom 24');
});

it('records a thrown non-error without inventing a message', async () => {
  await recordCrash('a string was thrown');
  const [rec] = await readCrashes();
  expect(rec.name).toBe('unknown');
  expect(rec.message).toBe('a string was thrown');
});

it('keeps no more of the stack than five frames', async () => {
  await recordCrash(new Error('x'), 'at A\n  at B\n  at C\n  at D\n  at E\n  at F');
  const [rec] = await readCrashes();
  expect(rec.frames).toHaveLength(5);
});

it('survives an unwritable store without throwing into the crash path', async () => {
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));
  await expect(recordCrash(new Error('x'))).resolves.toBeUndefined();
});

it('reads an empty list rather than throwing when nothing was ever stored', async () => {
  await expect(readCrashes()).resolves.toEqual([]);
});

it('forgets everything when asked', async () => {
  await recordCrash(new Error('x'));
  await clearCrashes();
  await expect(readCrashes()).resolves.toEqual([]);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx jest src/lib/__tests__/crashLog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `crashLog.ts`**

Cap at 20, newest first, five frames. Every `catch` swallows: the one place that must never throw is the crash path, because a throwing crash handler replaces a diagnosable crash with an undiagnosable one. Read the runtime version from `expo-updates` / `expo-constants` so a record names the build it came from.

- [ ] **Step 4: Run and confirm pass**

Run: `npx jest src/lib/__tests__/crashLog.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing boundary test**

```tsx
const Boom = () => { throw new Error('the reactor went out'); };

it('names the error instead of showing a blank screen', () => {
  const view = render(<CrashBoundary><Boom /></CrashBoundary>);
  expect(view.getByText(/the reactor went out/)).toBeTruthy();
});

it('persists what it caught', async () => {
  render(<CrashBoundary><Boom /></CrashBoundary>);
  await waitFor(async () => expect(await readCrashes()).toHaveLength(1));
});

it('lets the tree be remounted rather than requiring a restart', () => {
  const view = render(<CrashBoundary><Boom /></CrashBoundary>);
  fireEvent.press(view.getByText(/carry on/i));
  expect(view.queryByText(/the reactor went out/)).toBeNull();
});
```

Silence React's expected error log for these three cases only, with a comment saying it is expected — a suppressed log with no reason is how a real one gets missed.

- [ ] **Step 6: Run, implement, run**

Run: `npx jest src/components/__tests__/CrashBoundary.test.tsx` — FAIL, then implement, then PASS.

- [ ] **Step 7: Wrap the app and surface the log**

`App.tsx`: `<CrashBoundary>` outside the provider, so a provider throw is caught too. Add a diagnostics row that reads the count and opens the list. It must say **"Nothing has crashed"** for an empty log — never a blank panel, per §4.3.

- [ ] **Step 8: Full suite, typecheck, commit**

```bash
npx tsc --noEmit && npx jest
git add src/lib/crashLog.ts src/components/CrashBoundary.tsx App.tsx src/lib/__tests__/crashLog.test.ts src/components/__tests__/CrashBoundary.test.tsx
git commit -m "feat(mobile): a crash says what it was instead of restarting in silence"
```

---

## Task 4: He listens, and he speaks

`ROADMAP.md` §0c item 4 — *"Until then it is a beautifully themed text box."* Two halves, and only one is code.

**The listening half is a device check, not a change.** §1.4: Chat → hold → speak → release, then read `brains.usage.audio`. If it reads `fell_back` with `last_error_was_quota: false`, the mime type is wrong — the phone records m4a and Google documents `audio/aac`, not `audio/mp4`. One line, in the app. **It cannot be verified from this machine**: `adb` can wake the display but cannot unlock it, so the app launches behind the keyguard and never foregrounds, and `apps_linked: 0` in that state means nothing. Unlock by hand first. Listed, not ticked.

**The speaking half is `expo-speech`,** and it is app-only. The decision of *whether and what* to speak is pure and belongs in `src/lib/speech.ts` with its own tests; the native call sits at the edge.

**Files:**
- Create: `src/lib/speech.ts`, `src/lib/__tests__/speech.test.ts`
- Modify: the chat screen's arrival path; `src/theme/appearance.tsx` for the preference
- Modify: `package.json`, `app.json`

**Interfaces:**
- Produces:
  - `export type SpeakDecision = { speak: false; because: string } | { speak: true; text: string }`
  - `export function decideSpeech(turn: { text: string; fromUser: boolean }, prefs: { voice: boolean }): SpeakDecision`

- [ ] **Step 1: Write the failing decision tests**

```ts
const on = { voice: true };
const off = { voice: false };

it('does not speak the user back to themselves', () => {
  expect(decideSpeech({ text: 'hello', fromUser: true }, on).speak).toBe(false);
});

it('says why it stayed silent, so a silent feature is not a broken one', () => {
  const d = decideSpeech({ text: 'hello', fromUser: true }, on);
  expect(d.speak).toBe(false);
  if (!d.speak) expect(d.because).toBe('the turn is yours');
});

it('strips the glyph bullets the model writes before speaking them aloud', () => {
  const d = decideSpeech({ text: '• one\n• two', fromUser: false }, on);
  expect(d.speak).toBe(true);
  if (d.speak) expect(d.text).toBe('one. two.');
});

it('stays silent when the preference is off', () => {
  expect(decideSpeech({ text: 'hi', fromUser: false }, off).speak).toBe(false);
});

it('stays silent for an empty answer rather than clearing its throat', () => {
  expect(decideSpeech({ text: '   ', fromUser: false }, on).speak).toBe(false);
});
```

- [ ] **Step 2: Run — FAIL, module not found.** `npx jest src/lib/__tests__/speech.test.ts`

- [ ] **Step 3: Implement `decideSpeech`.** Pure. No `expo-speech` import in this file — the caller does the speaking, so the decision stays testable without a native mock. Reuse the bullet-glyph handling already written for chat rather than a second copy of it.

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Install and wire**

```bash
npx expo install expo-speech
```

Add the preference beside the existing animation switch in `src/theme/appearance.tsx` — same persistence, same shape, so there is one settings story. Speak on arrival of a non-user turn, and stop any utterance in flight before starting the next; two voices over each other is worse than none.

- [ ] **Step 6: Full suite, typecheck, commit**

```bash
npx tsc --noEmit && npx jest
git commit -m "feat(mobile): he answers out loud, when you have asked him to"
```

- [ ] **Step 7: The listening half — on the phone, by hand**

Unlock the phone. Chat → hold → speak → release. Read `brains.usage.audio`. Record the result in `RESUME.md` whichever way it goes, and if it reads `fell_back` with `last_error_was_quota: false`, change the mime to `audio/aac` and ship it over the air.

---

## Task 5: He survives a reboot

`ROADMAP.md` §3.1 — `BOOT_COMPLETED`, *"free, do it with the next build"*. The manifest has no `RECEIVE_BOOT_COMPLETED` (checked 2026-08-24).

**Not OTA.** A manifest change needs a build, and a local build needs the fingerprint re-baked or OTA silently stops arriving — the trap that cost an hour on 08-21.

**Files:**
- Create: `plugins/withBootCompleted.js`
- Modify: `app.json` (plugins array)

- [ ] **Step 1: Write the plugin**

Follow `plugins/withArm64Only.js` exactly — including a comment explaining *why a plugin and not an edit to `android/`*, because that is the reasoning this project keeps relearning. Use `withAndroidManifest` to add `android.permission.RECEIVE_BOOT_COMPLETED`.

- [ ] **Step 2: Register it in `app.json`** beside `./plugins/withArm64Only`.

- [ ] **Step 3: Prove it lands in the manifest**

Run: `npx expo prebuild --platform android --no-install`
Then: `grep RECEIVE_BOOT_COMPLETED android/app/src/main/AndroidManifest.xml`
Expected: one match. Also re-check `android/gradle.properties` still reads `reactNativeArchitectures=arm64-v8a` — if `prebuild` reverted it, the arm64 plugin has regressed, and that is a finding rather than a nuisance.

- [ ] **Step 4: Commit**

```bash
git add plugins/withBootCompleted.js app.json
git commit -m "feat(mobile): he comes back after a reboot"
```

- [ ] **Step 5: Owed, and not claimable from here** — that the receiver actually fires needs a build, an install, and a reboot with the phone unlocked. Record it as untested until then.

---

## Task 6: The notification listener — the step change, and the gate in front of it

`ROADMAP.md` §3.1 ranks this above the foreground service and well ahead of accessibility: event-driven, nearly free, and it delivers more context than any amount of polling — the message, the offer, the debit, the missed call. §7 is why it matters at all: this app **cannot** run background work on this phone (`expo-background-task` hardcodes `setRequiredNetworkType(CONNECTED)`; the uid reads `blocked=REASON_APP_BACKGROUND|REASON_APP_STANDBY` with `#netAvail=0` in a RARE bucket — stopped, not deferred).

**This task is gated, and the gate is not app-side.** §4.1.1 — splitting `APP_TOKEN` so the token that registers a push is not the token that reads your day — must land **before** any new sense, and it needs the gateway to validate the halves. That is brain work. §0c item 7 calls it *"a gate on §3, not a follow-up"*.

**So: no listener ships until the split lands.** What can honestly be built now is the capture-side design §4.1.2–4.1.4 demand — derived-only, OTP and financial content dropped at the point of capture, never logged — as a spec plus the pure reducer and its tests, with **no service registered and no permission requested**. A reducer with tests is worth having. A service collecting data before the token split is precisely the thing the roadmap says cannot be un-collected.

**Files:**
- Create: `docs/superpowers/specs/2026-08-24-notification-listener-design.md`
- Create: `src/lib/notifications/derive.ts`, `src/lib/notifications/__tests__/derive.test.ts`

**Interfaces:**
- Produces: `export function derive(n: { pkg: string; title: string; text: string }): DerivedFact | null` — `null` for anything matching an OTP or financial shape, and never a value containing any substring of `title` or `text`.

- [ ] **Step 1: Write the spec** — the fact vocabulary, the drop rules, the storage shape. Copy the approach in `src/lib/journal/facts.ts` rather than reinventing it.
- [ ] **Step 2: TDD the reducer**, with a case per drop rule and a case proving no input substring survives into the output.
- [ ] **Step 3: Commit the spec and the reducer.** Do not touch `modules/` or the manifest.
- [ ] **Step 4: Stop, and record in `ROADMAP.md`** that the listener is blocked on §4.1.1, which is brain work.

---

## Task 7: Usable by someone who cannot see it well

`ROADMAP.md` §0c item 10. Partly done, and the ledger undersells it: contrast is measured (`dim` on panel at 4.78 and 4.68 against a 4.5 bar), and reduced motion **is** already defaulted from the OS at `src/theme/appearance.tsx:89` via `AccessibilityInfo.isReduceMotionEnabled`, with a test spying on it. §0b calls that row `untested`; it has a test. Correcting the ledger is part of this task.

What is genuinely owed is a screen-reader pass: nothing has been checked with TalkBack.

- [ ] **Step 1: Audit for labels in code** — `grep -rn "accessibilityLabel\|accessibilityRole\|accessibilityState" src/components src/screens`, then list the interactive components with none. A dot-plus-word row needs the word in its label, or the screen reader gets the colour and nothing else.
- [ ] **Step 2: Add the missing labels**, one commit per screen, each with a test asserting the label exists.
- [ ] **Step 3: TalkBack on the device** — owed, needs the phone, not claimable from here.
- [ ] **Step 4: Fix the §0b rows** that call reduced motion `untested` and arm64 owed. `plugins/withArm64Only.js` exists and is registered in `app.json`; §6 still lists it as to-do.

---

## Blocked — not attempted, and why

| §0c | Item | Blocked on |
| --- | --- | --- |
| 2 (half) | §2.2 the false Saturday shift | Brain. The fix is **already committed** as `c86d176` in `jarvis-brain`; only the deploy is owed |
| 5 | *He knows where and when he is* — the situation block | Brain. §3.2.1 needs a gateway field |
| 6 | *Memory survives a deploy* | Brain. Merge `fix/durable-state` into `feat/cloud-gateway`, then deploy |
| 7 | *A compromised token does not expose a life* | Brain. §4.1.1 splits `APP_TOKEN`; the gateway validates both halves. **This gates Task 6** |
| 9 | *A second device is possible* | App, but needs an EAS credentials action and a fresh build — a real keystore replacing Expo's debug one (`android/app/build.gradle:112`) |
| — | §1.1 `run_harnesses.py` | Desk. No Python on this laptop (`python` opens the Microsoft Store) |
| — | §1.3 desk-key handshake, `BRIDGE_SECRET` rotation | Desk + brain. The only item whose cost grows while deferred |
| — | §6 `hourLabel` prints whole hours | Matched on both sides. Fixing the app alone desyncs the window label |

## Self-review

- **Spec coverage:** §0c items 1, 2 (app half), 3 (`BOOT_COMPLETED`), 4 (speaking), 8 (JS half) and 10 map to Tasks 1–5 and 7. Items 5, 6, 7, 9 and the remaining halves of 2, 3 and 8 are in the blocked table with a named blocker. No §0c item is unaccounted for.
- **Placeholders:** none. Every code step carries its code; Task 6 deliberately ships a spec and a reducer rather than a service, and says why.
- **Type consistency:** `CloudArmedState` is defined in Task 1 and consumed by that name in `status.ts` and `HomeScreen.tsx`. `CrashRecord`, `recordCrash`, `readCrashes`, `clearCrashes` are used in Task 3 exactly as declared. `decideSpeech` / `SpeakDecision` likewise in Task 4.
- **Known gap:** Task 2 Step 1's inventory cannot be enumerated in advance without the grep, so it is a step rather than a list. That is deliberate.
